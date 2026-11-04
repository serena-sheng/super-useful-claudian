import type { Readable } from 'node:stream';

import { subscribePiJSONLLines, writePiJSONL } from './PiJSONL';

const DEFAULT_TIMEOUT_MS = 30_000;

export type PiRPCRecord = Record<string, unknown>;
export type PiRPCEventHandler = (event: PiRPCRecord) => void;

export interface PiRPCStreams {
  input: Readable | NodeJS.ReadableStream;
  onClose?: (listener: (error?: Error) => void) => () => void;
  output: NodeJS.WritableStream;
}

interface PendingRequest {
  cleanup: () => void;
  reject: (error: Error) => void;
  resolve: (response: unknown) => void;
  type: string;
}

export class PiRPCTransportClosedError extends Error {
  constructor(message = 'Pi RPC transport closed') {
    super(message);
    this.name = 'PiRpcTransportClosedError';
  }
}

export class PiRPCResponseError extends Error {
  constructor(
    readonly commandType: string,
    message: string,
  ) {
    super(message);
    this.name = 'PiRpcResponseError';
  }
}

export class PiRPCTransport {
  private readonly closeListeners = new Set<(error?: Error) => void>();
  private disposed = false;
  private readonly eventHandlers = new Set<PiRPCEventHandler>();
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private unregisterClose?: () => void;
  private unsubscribeLines?: () => void;
  private protocolNegotiationStarted = false;
  private readonly chunkAssemblies = new Map<string, RpcChunkAssembly>();
  private readonly handleOutputError = (error: unknown): void => {
    this.dispose(error instanceof Error ? error : new Error(String(error)));
  };
  private readonly handleOutputClose = (): void => {
    this.dispose(new PiRPCTransportClosedError('Pi RPC output closed'));
    this.streams.output.off('error', this.handleOutputError);
    this.streams.output.off('close', this.handleOutputClose);
  };

  constructor(
    private readonly streams: PiRPCStreams,
    private readonly defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  get isClosed(): boolean {
    return this.disposed;
  }

  start(): void {
    if (this.unsubscribeLines || this.disposed) {
      return;
    }

    this.streams.output.on('error', this.handleOutputError);
    this.streams.output.on('close', this.handleOutputClose);
    this.unsubscribeLines = subscribePiJSONLLines(
      this.streams.input,
      (line) => this.#handleLine(line),
      () => {
        if (!this.disposed) {
          this.dispose(new PiRPCTransportClosedError('Pi RPC input closed'));
        }
      },
      (error) => {
        if (!this.disposed) {
          this.dispose(error);
        }
      },
    );

    this.unregisterClose = this.streams.onClose?.((error) => {
      if (!this.disposed) {
        this.dispose(error ?? new PiRPCTransportClosedError());
      }
    });
  }

  onEvent(handler: PiRPCEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  request<T = unknown>(
    commandType: string,
    payload: Record<string, unknown> = {},
    timeoutMs = this.defaultTimeoutMs,
    signal?: AbortSignal,
  ): Promise<T> {
    this.start();
    if (this.disposed) {
      return Promise.reject(new PiRPCTransportClosedError());
    }

    const id = `req_${this.nextId++}`;
    return new Promise<T>((resolve, reject) => {
      let timer: number | undefined;
      let onAbort: (() => void) | undefined;
      const cleanup = (): void => {
        if (timer !== undefined) {
          window.clearTimeout(timer);
        }
        if (onAbort && signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (timeoutMs > 0) {
        timer = window.setTimeout(() => {
          this.pending.delete(id);
          cleanup();
          reject(new Error(`Request timeout: ${commandType} (${timeoutMs}ms)`));
        }, timeoutMs);
      }

      if (signal?.aborted) {
        cleanup();
        reject(new Error(`Request aborted: ${commandType}`));
        return;
      }
      if (signal) {
        onAbort = () => {
          this.pending.delete(id);
          cleanup();
          reject(new Error(`Request aborted: ${commandType}`));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pending.set(id, {
        cleanup,
        reject,
        resolve: (response: unknown) => resolve(response as T),
        type: commandType,
      });

      try {
        this.#sendRaw({ id, type: commandType, ...payload });
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        const transportError = error instanceof Error ? error : new Error(String(error));
        this.dispose(transportError);
        reject(transportError);
      }
    });
  }

  send(record: PiRPCRecord): void {
    this.start();
    if (this.disposed) {
      return;
    }
    this.#sendRaw(record);
  }

  dispose(error: Error = new PiRPCTransportClosedError('Pi RPC transport disposed')): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    // In-flight writes can fail after disposal; own their errors until the output closes.
    this.unsubscribeLines?.();
    this.unsubscribeLines = undefined;
    this.unregisterClose?.();
    this.unregisterClose = undefined;
    this.chunkAssemblies.clear();
    this.#rejectAllPending(error);
    for (const listener of this.closeListeners) {
      try {
        listener(error);
      } catch {
        // Best-effort close notification.
      }
    }
    this.closeListeners.clear();
    this.eventHandlers.clear();
  }

  #sendRaw(record: PiRPCRecord): void {
    writePiJSONL(this.streams.output, record);
  }

  #handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let record: PiRPCRecord;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!isPlainObject(parsed)) {
        return;
      }
      record = parsed;
    } catch {
      return;
    }

    if (record.type === 'rpc_chunk') {
      this.#handleChunk(record);
      return;
    }

    if (record.type === 'response' && record.command === 'negotiate_protocol') {
      // The handshake answer is consumed here; callers never await it directly.
      return;
    }

    if (record.type === 'response' && typeof record.id === 'string') {
      this.#handleResponse(record.id, record);
      return;
    }

    if (record.type === 'ready') {
      this.#startProtocolNegotiation(record);
    }

    for (const handler of this.eventHandlers) {
      handler(record);
    }
  }

  /**
   * Pi peers speak protocol v1, where one frame may not exceed 1 MiB. Forks such
   * as omp advertise v2 with chunked frames and a larger reassembled limit;
   * negotiate it when available so big payloads (model catalogs, long tool
   * results) arrive instead of being replaced by "RPC response exceeded the
   * transport limit".
   */
  #startProtocolNegotiation(record: PiRPCRecord): void {
    if (this.protocolNegotiationStarted) {
      return;
    }
    this.protocolNegotiationStarted = true;
    const supported = Array.isArray(record.supportedProtocolVersions)
      ? record.supportedProtocolVersions
      : [];
    const canChunk = supported.includes(2)
      && typeof record.maxReassembledFrameBytes === 'number';
    if (!canChunk) {
      return;
    }
    try {
      this.#sendRaw({
        id: `negotiate_${this.nextId++}`,
        protocolVersion: 2,
        type: 'negotiate_protocol',
      });
    } catch {
      // A peer that cannot take the handshake simply stays on protocol v1.
    }
  }

  #handleChunk(record: PiRPCRecord): void {
    const chunkId = typeof record.chunkId === 'string' ? record.chunkId : '';
    const data = record.data;
    const index = record.index;
    const count = record.count;
    const byteLength = record.byteLength;
    if (!chunkId || typeof data !== 'string') {
      return;
    }
    if (
      typeof index !== 'number' || !Number.isSafeInteger(index)
      || typeof count !== 'number' || !Number.isSafeInteger(count)
      || typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength)
      || index < 0 || count < 1 || index >= count || byteLength < 0
    ) {
      return;
    }

    let assembly = this.chunkAssemblies.get(chunkId);
    if (!assembly) {
      if (index !== 0) {
        return;
      }
      assembly = {
        byteLength,
        chunks: [],
        count,
        nextIndex: 0,
        receivedBytes: 0,
      };
      this.chunkAssemblies.set(chunkId, assembly);
    }
    if (
      assembly.count !== count
      || assembly.byteLength !== byteLength
      || assembly.nextIndex !== index
    ) {
      this.chunkAssemblies.delete(chunkId);
      return;
    }

    const bytes = Buffer.from(data, 'base64');
    assembly.chunks.push(bytes);
    assembly.receivedBytes += bytes.byteLength;
    assembly.nextIndex += 1;
    if (assembly.nextIndex < assembly.count) {
      return;
    }

    this.chunkAssemblies.delete(chunkId);
    if (assembly.receivedBytes !== assembly.byteLength) {
      return;
    }
    try {
      this.#handleLine(Buffer.concat(assembly.chunks).toString('utf8'));
    } catch {
      // Malformed reassembled frame: drop it rather than tearing the transport down.
    }
  }

  #handleResponse(id: string, record: PiRPCRecord): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    this.pending.delete(id);
    pending.cleanup();
    if (record.success === false) {
      const errorText = typeof record.error === 'string'
        ? record.error
        : `Pi RPC command failed: ${pending.type}`;
      pending.reject(new PiRPCResponseError(pending.type, errorText));
      return;
    }

    if ('result' in record) {
      pending.resolve(record.result);
      return;
    }
    if ('data' in record) {
      pending.resolve(record.data);
      return;
    }
    pending.resolve(record);
  }

  #rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function isPlainObject(value: unknown): value is PiRPCRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface RpcChunkAssembly {
  byteLength: number;
  chunks: Buffer[];
  count: number;
  nextIndex: number;
  receivedBytes: number;
}
