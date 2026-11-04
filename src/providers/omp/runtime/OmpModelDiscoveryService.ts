import { parseEnvironmentVariables } from '@/core/process/env';

import type { ProviderRuntimeHost } from '../../../core/providers/ProviderRuntimeHost';
import { decodeOmpConfig } from '../config';
import {
  normalizeOmpDiscoveredModels,
  type OmpDiscoveredModel,
} from '../models';
import { buildOmpEnvironment, buildOmpLaunchSpec } from './OmpLaunchSpecBuilder';
import { OmpRPCTransport } from './OmpRPCTransport';
import { OmpSubprocess } from './OmpSubprocess';

export type OmpModelDiscoveryResult =
  | {
    kind: 'completed';
    diagnostics?: string;
    models: OmpDiscoveredModel[];
  }
  | {
    kind: 'skipped';
    reason: 'provider-disabled';
  };

export class OmpModelDiscoveryService {
  constructor(private readonly host: ProviderRuntimeHost) {}

  async discoverModels(signal?: AbortSignal): Promise<OmpModelDiscoveryResult> {
    const settings = decodeOmpConfig(this.host.config, this.host.selection);
    if (!settings.enabled) {
      return { kind: 'skipped', reason: 'provider-disabled' };
    }

    const cwd = this.host.workingDirectory ?? process.cwd();
    const command = await this.host.resolveCliPath() ?? 'omp';
    const envText = this.host.environmentText;
    const env = buildOmpEnvironment(process.env, parseEnvironmentVariables(envText));
    const launchSpec = buildOmpLaunchSpec({
      command,
      cwd,
      env,
      envText,
      noSession: true,
      settings,
    });
    const subprocess = new OmpSubprocess(launchSpec);
    let transport: OmpRPCTransport | null = null;
    let removeEventListener: (() => void) | null = null;

    const abort = () => { transport?.dispose(); void subprocess.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      signal?.throwIfAborted();
      subprocess.start();
      transport = new OmpRPCTransport({
        input: subprocess.stdout,
        onClose: (listener) => subprocess.onClose(listener),
        output: subprocess.stdin,
      });
      transport.start();
      // The transport negotiates a chunked protocol from the ready frame; wait for
      // it so the catalog request is not answered under the 1 MiB v1 frame limit.
      await waitForReady(transport, signal);
      removeEventListener = transport.onEvent((event) => {
        if (event.type !== 'extension_ui_request') {
          return;
        }

        const id = typeof event.id === 'string' && event.id.trim() ? event.id.trim() : '';
        if (id) {
          transport?.send({
            cancelled: true,
            id,
            type: 'extension_ui_response',
          });
        }
      });
      const response = await transport.request('get_available_models', {}, 20_000);
      const models = normalizeOmpDiscoveredModels(extractModels(response)).map(model => {
        // This complete native response is authoritative, including non-reasoning models.
        delete model.reasoningMetadataResolved;
        return model;
      });
      return { kind: 'completed', models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OMP model discovery failed';
      const stderr = subprocess.getStderrSnapshot();
      return {
        diagnostics: stderr ? `${message}\n\n${stderr}` : message,
        kind: 'completed',
        models: [],
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      removeEventListener?.();
      transport?.dispose();
      await subprocess.shutdown().catch(() => {});
    }
  }
}

function waitForReady(transport: OmpRPCTransport, signal?: AbortSignal, timeoutMs = 15_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      unsubscribe?.();
      signal?.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onAbort = (): void => finish(new Error('OMP model discovery aborted'));
    const timer = window.setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    const unsubscribe = transport.onEvent((event) => {
      if (event.type === 'ready') {
        finish();
      }
    });
    if (signal?.aborted) {
      finish(new Error('OMP model discovery aborted'));
      return;
    }
    if (transport.isClosed) {
      finish(new Error('OMP RPC transport closed before ready'));
    }
  });
}

function extractModels(response: unknown): unknown {
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const record = response as Record<string, unknown>;
    return record.models ?? record.availableModels ?? record.available_models ?? [];
  }
  return [];
}
