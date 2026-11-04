import { assertCatalogModelAvailable, modelCatalogCases } from '@test/helpers/providerModelCatalogs';
import { runtimeHostFor } from '@test/helpers/providerRuntimeHost';

import type { ProviderModelCatalog } from '@/core/providers/models/ProviderModelCatalog';
import { ProviderModelUnavailableError } from '@/core/providers/models/ProviderModelUnavailableError';
import { createDeepSeekModels } from '@/providers/deepseek/runtime/DeepSeekModels';
import { createOmpModels } from '@/providers/omp/runtime/OmpModels';

const mockOmpDiscover = jest.fn();
jest.mock('@/providers/omp/runtime/OmpModelDiscoveryService', () => ({
  OmpModelDiscoveryService: class { discoverModels = mockOmpDiscover; },
}));

const browseOrders = {
  deepseek: ['deepseek:native/selected', 'deepseek:native/unselected-catalog-entry'],
  omp: ['omp:anthropic/unselected-catalog-entry', 'omp:anthropic/selected'],
};

it.each(modelCatalogCases)('$id keeps native selection, aliases and metadata behind the common catalog', async ({id, selected, populate, read}) => {
  const settings: Record<string, unknown> = {};
  populate(settings);
  const persist = jest.fn(async () => undefined);
  const host = runtimeHostFor({ settings, notifyProviderChatOptionsChanged: jest.fn() }, id, { persist });
  const discovery = jest.fn(async () => ({
    groups: [{ id: 'native', models: [{ id: 'selected', name: 'Selected label' }, { id: 'unselected-catalog-entry', name: 'Unselected' }] }],
  }));
  mockOmpDiscover.mockResolvedValue({ kind: 'completed', models: read(settings) });
  const factories: Record<string, () => ProviderModelCatalog> = {
    deepseek: () => createDeepSeekModels(host, discovery),
    omp: () => createOmpModels(host),
  };
  const catalog = factories[id]();
  const discoveredModels = structuredClone(read(settings));
  expect(catalog.getSnapshot().models.map(model => model.id)).toEqual(browseOrders[id]);
  expect(read(settings)).toEqual(discoveredModels);
  const selectedId = catalog.getSnapshot().selectedIds[0];
  expect(catalog.getSnapshot().defaultModelId).toBe(selectedId);
  expect(() => assertCatalogModelAvailable(id, settings, selected)).not.toThrow();
  await catalog.refresh();
  const discover = id === 'omp' ? mockOmpDiscover : discovery;
  const calls = discover.mock.calls.length;
  catalog.markStale();
  await catalog.refresh();
  expect(discover).toHaveBeenCalledTimes(calls);
  expect(catalog.getSnapshot()).toMatchObject({ stale: true, discoveredCount: 2, selectedIds: [selectedId] });
  await catalog.refresh({ force: true });
  expect(discover).toHaveBeenCalledTimes(calls + 1);
  await catalog.setAlias(selectedId, 'My selected model');
  expect(catalog.getSnapshot().aliases[selectedId]).toBe('My selected model');
  await catalog.changeSelection({ type: 'clear' });
  expect(catalog.getSnapshot().selectedIds).toEqual([]);
  expect(() => assertCatalogModelAvailable(id, settings, selected)).toThrow(ProviderModelUnavailableError);
  await catalog.changeSelection({ type: 'set', modelId: selectedId, selected: true });
  const before = structuredClone(settings);
  persist.mockRejectedValueOnce(new Error('disk full'));
  await expect(catalog.changeSelection({ type: 'clear' })).rejects.toThrow('disk full');
  expect(settings).toEqual(before);
  expect(catalog.getSnapshot().selectedIds).toEqual([selectedId]);
  await catalog.dispose();
});
