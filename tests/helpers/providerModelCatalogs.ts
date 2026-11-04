import { runtimeHostFor } from '@test/helpers/providerRuntimeHost';

import { assertDeepSeekModelAvailable } from '@/providers/deepseek/runtime/DeepSeekModels';
import { getDeepSeekProviderSettings, updateDeepSeekProviderSettings } from '@/providers/deepseek/settings';
import { normalizeOmpDiscoveredModels } from '@/providers/omp/models';
import { assertOmpModelAvailable } from '@/providers/omp/runtime/OmpModelAvailability';
import { getOmpProviderSettings, updateOmpProviderSettings } from '@/providers/omp/settings';

const availabilityGuards = {
  deepseek: (settings: Record<string, unknown>, model: string | undefined) => {
    assertDeepSeekModelAvailable(runtimeHostFor({ settings }, 'deepseek'), model);
  },
  omp: (settings: Record<string, unknown>, model: string | undefined) => {
    const host = runtimeHostFor({ settings }, 'omp');
    assertOmpModelAvailable(getOmpProviderSettings(settings), model, host.selection.model);
  },
};

/** Runs a provider's execution-time model guard against a settings document. */
export function assertCatalogModelAvailable(
  providerId: keyof typeof availabilityGuards,
  settings: Record<string, unknown>,
  model: string | undefined,
): void {
  availabilityGuards[providerId](settings, model);
}

export const modelCatalogCases = [
  {
    id: 'deepseek' as const, selected: 'deepseek:native/selected',
    populate(settings: Record<string, unknown>) {
      updateDeepSeekProviderSettings(settings, { enabled: true, visibleModels: ['deepseek:native/selected'], discoveredModels: [
        { encodedId: 'deepseek:native/selected', id: 'selected', provider: 'native', label: 'Selected label', reasoning: [] },
        { encodedId: 'deepseek:native/unselected-catalog-entry', id: 'unselected-catalog-entry', provider: 'native', label: 'Unselected', reasoning: [] },
      ] });
    },
    read: (settings: Record<string, unknown>) => getDeepSeekProviderSettings(settings).discoveredModels,
  },
  {
    id: 'omp' as const, selected: 'omp:anthropic/selected',
    populate(settings: Record<string, unknown>) {
      updateOmpProviderSettings(settings, {
        enabled: true,
        visibleModels: ['omp:anthropic/selected'],
        discoveredModels: normalizeOmpDiscoveredModels([
          { id: 'selected', input: ['text', 'image'], label: 'Selected label', provider: 'anthropic', thinkingLevels: ['off', 'high'] },
          { id: 'unselected-catalog-entry', input: ['text', 'image'], label: 'Unselected', provider: 'anthropic', thinkingLevels: ['off'] },
        ]),
      });
    },
    read: (settings: Record<string, unknown>) => getOmpProviderSettings(settings).discoveredModels,
  },
];
