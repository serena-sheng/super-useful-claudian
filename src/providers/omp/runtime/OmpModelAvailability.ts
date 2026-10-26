import { ProviderModelUnavailableError } from '../../../core/providers/models/ProviderModelUnavailableError';
import type { OmpProviderSettings } from '../config';

export function assertOmpModelAvailable(
  config: OmpProviderSettings,
  requestedModel: string | undefined,
  fallbackModel: string | undefined,
): void {
  const model = requestedModel ?? fallbackModel ?? '';
  if (!(config.enabled && config.visibleModels.includes(model)
    && config.discoveredModels.some(candidate => candidate.encodedId === model))) {
    throw new ProviderModelUnavailableError('OMP');
  }
}
