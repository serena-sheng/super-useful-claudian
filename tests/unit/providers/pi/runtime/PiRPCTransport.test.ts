import { PassThrough, Writable } from 'node:stream';

import {
  PiRPCResponseError,
  PiRPCTransport,
  PiRPCTransportClosedError,
} from '@/providers/pi/runtime/PiRPCTransport';

function createTransport() {
  const input = new PassThrough();
  const output = new PassThrough();
  const writes: string[] = [];
  output.on('data', chunk => writes.push(chunk.toString('utf8')));
  const transport = new PiRPCTransport({ input, output }, 100);
  transport.start();
  return { input, output, transport, writes };
}

describe('PiRPCTransport', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes command requests with string ids', async () => {
    const { input, transport, writes } = createTransport();
    const promise = transport.request('get_state', { foo: 'bar' });

    expect(JSON.parse(writes[0]) as unknown).toEqual({
      foo: 'bar',
      id: 'req_1',
      type: 'get_state',
    });

    input.write('{"type":"response","id":"req_1","success":true,"result":{"ok":true}}\n');
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('sends fire-and-forget records without pending request tracking', () => {
    const { transport, writes } = createTransport();

    transport.send({ id: 'ui-1', type: 'extension_ui_response', value: 'ok' });

    expect(JSON.parse(writes[0]) as unknown).toEqual({
      id: 'ui-1',
      type: 'extension_ui_response',
      value: 'ok',
    });
  });

  it('resolves concurrent requests by id out of order', async () => {
    const { input, transport } = createTransport();
    const first = transport.request('first');
    const second = transport.request('second');

    input.write('{"type":"response","id":"req_2","success":true,"result":2}\n');
    input.write('{"type":"response","id":"req_1","success":true,"result":1}\n');

    await expect(second).resolves.toBe(2);
    await expect(first).resolves.toBe(1);
  });

  it('unwraps Pi response data when result is absent', async () => {
    const { input, transport } = createTransport();
    const promise = transport.request('get_available_models');

    input.write('{"type":"response","id":"req_1","success":true,"data":{"models":[{"id":"gpt-5"}]}}\n');

    await expect(promise).resolves.toEqual({ models: [{ id: 'gpt-5' }] });
  });

  it('routes non-response events to listeners', () => {
    const { input, transport } = createTransport();
    const events: unknown[] = [];
    transport.onEvent(event => events.push(event));

    input.write('{"type":"message_update","delta":"hi"}\n');

    expect(events).toEqual([{ type: 'message_update', delta: 'hi' }]);
  });

  it('ignores malformed JSON records without failing pending requests', async () => {
    const { input, transport } = createTransport();
    const promise = transport.request('prompt');

    input.write('not-json\n');
    input.write('{"type":"response","id":"req_1","success":true,"result":{"accepted":true}}\n');

    await expect(promise).resolves.toEqual({ accepted: true });
  });

  it('rejects failed responses and pending requests on dispose', async () => {
    const { input, transport } = createTransport();
    const failed = transport.request('prompt');
    input.write('{"type":"response","id":"req_1","success":false,"error":"boom"}\n');

    await expect(failed).rejects.toBeInstanceOf(PiRPCResponseError);

    const pending = transport.request('prompt');
    transport.dispose();
    await expect(pending).rejects.toBeInstanceOf(PiRPCTransportClosedError);
  });

  it('rejects timed-out requests and removes them from the pending set', async () => {
    jest.useFakeTimers();
    const { input, transport } = createTransport();
    const timedOut = transport.request('prompt', {}, 100);

    jest.advanceTimersByTime(100);
    await expect(timedOut).rejects.toThrow('Request timeout: prompt');

    input.write('{"type":"response","id":"req_1","success":true,"result":"late"}\n');
    const next = transport.request('get_state', {}, 100);
    input.write('{"type":"response","id":"req_2","success":true,"result":{"ok":true}}\n');
    await expect(next).resolves.toEqual({ ok: true });
  });

  it('rejects an aborted request and removes it from the pending set', async () => {
    const { input, transport } = createTransport();
    const abortController = new AbortController();
    const request = transport.request(
      'get_commands',
      {},
      1_000,
      abortController.signal,
    );

    abortController.abort();

    await expect(request).rejects.toThrow('Request aborted: get_commands');
    input.write('{"type":"response","id":"req_1","success":true,"result":[]}\n');
    expect((transport as any).pending).toHaveProperty('size', 0);
  });

  it.each(['write error', 'output close'] as const)('closes pending requests on %s without waiting for a response', async failure => {
    const input = new PassThrough();
    const error = new Error('write EPIPE');
    let failWrite: () => void = () => { throw new Error('No write was issued'); };
    const output = new Writable({ write(_chunk, _encoding, callback) {
      if (failure === 'write error') failWrite = () => callback(error);
      else callback();
    } });
    const transport = new PiRPCTransport({ input, output }, 0);
    const closed = jest.fn();
    transport.onClose(closed);
    const pending = Promise.allSettled([transport.request('prompt'), transport.request('get_state')]);
    try {
      const streamEvent = new Promise<void>(resolve => output.once(failure === 'write error' ? 'error' : 'close', () => resolve()));
      if (failure === 'write error') failWrite();
      else output.destroy();
      await streamEvent;
      expect(transport.isClosed).toBe(true);
      const expected = failure === 'write error' ? error : new PiRPCTransportClosedError('Pi RPC output closed');
      expect(await pending).toEqual([
        { status: 'rejected', reason: expected },
        { status: 'rejected', reason: expected },
      ]);
      await expect(transport.request('prompt')).rejects.toBeInstanceOf(PiRPCTransportClosedError);
      input.destroy();
      await new Promise(resolve => setImmediate(resolve));
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      transport.dispose();
      await pending;
      input.destroy();
      output.destroy();
    }
  });

  it('handles an in-flight write error after disposal until the output closes', async () => {
    const input = new PassThrough();
    const error = new Error('write EPIPE');
    let failWrite: () => void = () => { throw new Error('No write was issued'); };
    const output = new Writable({ write(_chunk, _encoding, callback) {
      failWrite = () => callback(error);
    } });
    const unhandledErrors: unknown[] = [];
    const emit = output.emit.bind(output);
    jest.spyOn(output, 'emit').mockImplementation((event, ...args) => {
      // Record the otherwise fatal event so a failing implementation does not crash the test runner.
      if (event === 'error' && output.listenerCount('error') === 0) {
        unhandledErrors.push(args[0]);
        return false;
      }
      return emit(event, ...args);
    });
    const transport = new PiRPCTransport({ input, output }, 0);
    const closed = jest.fn();
    transport.onClose(closed);
    const pending = transport.request('prompt');
    transport.dispose();
    await expect(pending).rejects.toBeInstanceOf(PiRPCTransportClosedError);
    const outputClosed = new Promise<void>(resolve => output.once('close', () => resolve()));
    failWrite();
    await outputClosed;
    expect(unhandledErrors).toEqual([]);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(output.listenerCount('error')).toBe(0);
    input.destroy();
  });
});

describe('PiRPCTransport protocol negotiation', () => {
  const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

  function createNegotiatingTransport() {
    const input = new PassThrough();
    const output = new PassThrough();
    const writes: string[] = [];
    output.on('data', chunk => writes.push(chunk.toString('utf8')));
    const transport = new PiRPCTransport({ input, output });
    transport.start();
    return { input, output, transport, writes };
  }

  it('negotiates chunked protocol v2 and reassembles a chunked response', async () => {
    const { input, output, transport, writes } = createNegotiatingTransport();
    try {
      input.write(JSON.stringify({
        type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1, 2],
        maxFrameBytes: 1048576, maxReassembledFrameBytes: 8388608,
      }) + '\n');
      await flush();
      expect(writes).toHaveLength(1);
      const negotiate = JSON.parse(writes[0]);
      expect(negotiate).toMatchObject({ protocolVersion: 2, type: 'negotiate_protocol' });

      input.write(JSON.stringify({
        type: 'response', id: negotiate.id, command: 'negotiate_protocol',
        success: true, data: { protocolVersion: 2 },
      }) + '\n');

      const response = transport.request('get_available_models');
      await flush();
      expect(writes).toHaveLength(2);
      const request = JSON.parse(writes[1]);
      expect(request.type).toBe('get_available_models');

      const payload = JSON.stringify({
        type: 'response', id: request.id, success: true, data: { models: [{ id: 'm'.repeat(64) }] },
      });
      const bytes = Buffer.from(payload, 'utf8');
      const count = 3;
      const chunkBytes = Math.ceil(bytes.byteLength / count);
      for (let index = 0; index < count; index += 1) {
        const slice = bytes.subarray(index * chunkBytes, Math.min(bytes.byteLength, (index + 1) * chunkBytes));
        input.write(JSON.stringify({
          type: 'rpc_chunk', chunkId: 'rpc-1', index, count, byteLength: bytes.byteLength,
          data: slice.toString('base64'),
        }) + '\n');
      }

      await expect(response).resolves.toEqual({ models: [{ id: 'm'.repeat(64) }] });
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });

  it('stays on protocol v1 when the peer does not advertise chunked frames', async () => {
    const { input, output, transport, writes } = createNegotiatingTransport();
    try {
      input.write(JSON.stringify({ type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1] }) + '\n');
      await flush();
      expect(writes).toEqual([]);
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });

  it('drops invalid and misordered chunks without closing the transport', async () => {
    const { input, output, transport } = createNegotiatingTransport();
    try {
      const response = transport.request('get_state');
      const payload = JSON.stringify({
        type: 'response', id: 'req_1', success: true, result: { ok: true },
      });
      const bytes = Buffer.from(payload, 'utf8');
      const split = Math.ceil(bytes.byteLength / 2);
      // A chunk that does not start its assembly and a non-integer index are dropped.
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'bad', index: 1, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(split).toString('base64'),
      }) + '\n');
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'bad', index: 0.5, count: 2, byteLength: bytes.byteLength, data: '',
      }) + '\n');
      expect(transport.isClosed).toBe(false);

      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'ok', index: 0, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(0, split).toString('base64'),
      }) + '\n');
      input.write(JSON.stringify({
        type: 'rpc_chunk', chunkId: 'ok', index: 1, count: 2, byteLength: bytes.byteLength,
        data: bytes.subarray(split).toString('base64'),
      }) + '\n');

      await expect(response).resolves.toEqual({ ok: true });
    } finally {
      transport.dispose();
      input.destroy();
      output.destroy();
    }
  });
});
