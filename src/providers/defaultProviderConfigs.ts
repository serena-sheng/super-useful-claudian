import type { ProviderConfigMap } from '../core/types/settings';
import { DEFAULT_DEEPSEEK_PROVIDER_SETTINGS } from './deepseek/config';
import { DEFAULT_OMP_PROVIDER_SETTINGS } from './omp/config';

export function getBuiltInProviderDefaultConfigs(): ProviderConfigMap {
  return {
    deepseek: { ...DEFAULT_DEEPSEEK_PROVIDER_SETTINGS },
    omp: { ...DEFAULT_OMP_PROVIDER_SETTINGS },
  };
}
