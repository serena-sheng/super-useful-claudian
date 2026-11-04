import { parseEnvironmentVariables } from '@/core/process/env';

import type { ProviderRuntimeHost } from '../../../core/providers/ProviderRuntimeHost';
import { decodePiConfig } from '../config';
import {
  normalizePiDiscoveredModels,
  type PiDiscoveredModel,
} from '../models';
import { buildPiLaunchSpec } from './PiLaunchSpecBuilder';
import { PiRPCTransport } from './PiRPCTransport';
import { PiSubprocess } from './PiSubprocess';

export type PiModelDiscoveryResult =
  | {
    kind: 'completed';
    diagnostics?: string;
    models: PiDiscoveredModel[];
  }
  | {
    kind: 'skipped';
    reason: 'provider-disabled';
  };

export class PiModelDiscoveryService {
  constructor(private readonly host: ProviderRuntimeHost) {}

  async discoverModels(signal?: AbortSignal): Promise<PiModelDiscoveryResult> {
    const settings = decodePiConfig(this.host.config, this.host.selection);
    if (!settings.enabled) {
      return { kind: 'skipped', reason: 'provider-disabled' };
    }

    const cwd = this.host.workingDirectory ?? process.cwd();
    const command = await this.host.resolveCliPath() ?? 'pi';
    const envText = this.host.environmentText;
    const env = {
      ...process.env,
      ...parseEnvironmentVariables(envText),
    };
    const launchSpec = buildPiLaunchSpec({
      command,
      cwd,
      env,
      envText,
      noSession: true,
      settings,
    });
    const subprocess = new PiSubprocess(launchSpec);
    let transport: PiRPCTransport | null = null;
    let removeEventListener: (() => void) | null = null;

    const abort = () => { transport?.dispose(); void subprocess.shutdown().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      signal?.throwIfAborted();
      subprocess.start();
      transport = new PiRPCTransport({
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
      const models = normalizePiDiscoveredModels(extractModels(response)).map(model => {
        // This complete native response is authoritative, including non-reasoning models.
        delete model.reasoningMetadataResolved;
        return model;
      });
      return { kind: 'completed', models };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pi model discovery failed';
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

function waitForReady(transport: PiRPCTransport, signal?: AbortSignal, timeoutMs = 15_000): Promise<void> {
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
    const onAbort = (): void => finish(new Error('Pi model discovery aborted'));
    const timer = window.setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    const unsubscribe = transport.onEvent((event) => {
      if (event.type === 'ready') {
        finish();
      }
    });
    if (signal?.aborted) {
      finish(new Error('Pi model discovery aborted'));
      return;
    }
    if (transport.isClosed) {
      finish(new Error('Pi RPC transport closed before ready'));
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
