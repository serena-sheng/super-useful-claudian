import { selectModelMetadata } from '../../core/providers/models/selectedModelMetadata';
import { getProviderConfig, getProviderSelectionInputs, setProviderConfig } from '../../core/providers/providerConfig';
import { decodeOmpConfig, updateOmpConfig } from './config';

export {
  DEFAULT_OMP_PROVIDER_SETTINGS,
  type OmpProviderSettings,
  type PersistedOmpProviderSettings,
} from './config';

/** Reads OMP's configuration from the settings document. */
export function getOmpProviderSettings(settings: Record<string, unknown>): ReturnType<typeof decodeOmpConfig> {
  return decodeOmpConfig(
    getProviderConfig(settings, 'omp'),
    getProviderSelectionInputs(settings, 'omp'),
  );
}

/** Writes OMP's configuration into the settings document. */
export function updateOmpProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<ReturnType<typeof decodeOmpConfig>>,
): ReturnType<typeof decodeOmpConfig> {
  const config = getProviderConfig(settings, 'omp');
  const selection = getProviderSelectionInputs(settings, 'omp');
  const next = updateOmpConfig(config, selection, updates);
  setProviderConfig(settings, 'omp', config);
  return next;
}

export function projectOmpModelSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const current = getOmpProviderSettings(settings);
  const selected = new Set(current.visibleModels);
  const config: Record<string, unknown> = {
    ...getProviderConfig(settings, 'omp'),
    visibleModels: current.visibleModels,
    modelAliases: selectModelMetadata(current.modelAliases, selected),
    preferredThinkingByModel: selectModelMetadata(current.preferredThinkingByModel, selected),
    selectedModels: current.discoveredModels.filter(model => selected.has(model.encodedId)),
  };
  for (const key of ['discoveredModels', 'catalogTimestamp', 'catalogFingerprint', 'availableModes']) {
    delete config[key];
  }
  return config;
}
