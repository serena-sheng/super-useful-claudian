import {
  ProviderModelCatalogController,
  type ProviderModelCatalogState,
} from '../../../core/providers/models/ProviderModelCatalog';
import type { ProviderRuntimeHost } from '../../../core/providers/ProviderRuntimeHost';
import { decodeOmpConfig, updateOmpConfig } from '../config';
import { OmpModelDiscoveryService } from './OmpModelDiscoveryService';

function catalogState(host: ProviderRuntimeHost): ProviderModelCatalogState {
  const current = decodeOmpConfig(host.config, host.selection);
  return {
    enabled: current.enabled,
    models: current.discoveredModels.map(model => ({
      id: model.encodedId, name: model.label, providerKey: model.provider, providerLabel: model.provider,
      description: [
        model.api,
        model.contextWindow ? `${model.contextWindow.toLocaleString()} context` : '',
        model.reasoning ? `thinking: ${model.thinkingLevels.join(', ')}` : 'thinking: off',
      ].filter(Boolean).join(' | '),
    })).reverse(),
    selectedIds: current.visibleModels,
    aliases: current.modelAliases,
  };
}

export function createOmpModels(host: ProviderRuntimeHost): ProviderModelCatalogController {
  const discovery = new OmpModelDiscoveryService(host);
  return new ProviderModelCatalogController({
    providerName: 'OMP',
    store: {
      read: () => catalogState(host),
      write: async change => {
        await host.updateConfig((config, selection) => {
          const patch = change(catalogState(host));
          updateOmpConfig(config, selection, {
            ...(patch.visibleModels ? { visibleModels: patch.visibleModels } : {}),
            ...(patch.modelAliases ? { modelAliases: patch.modelAliases } : {}),
          });
          return true;
        });
      },
      notifyChatOptionsChanged: () => host.notifyChatOptionsChanged(),
    },
    discover: async signal => {
      const result = await discovery.discoverModels(signal);
      if (result.kind === 'skipped') return { changed: false };
      if (result.diagnostics) return { changed: false, diagnostics: result.diagnostics };
      await host.updateConfig((config, selection) => {
        if (signal.aborted) return false;
        updateOmpConfig(config, selection, { discoveredModels: result.models });
        return true;
      });
      if (signal.aborted) return { changed: false };
      host.notifyChatOptionsChanged();
      return { changed: true };
    },
  });
}
