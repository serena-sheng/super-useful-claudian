import '@/providers';

import { FakeAuxiliaryBackend, waitFor } from '@test/helpers/core/auxiliary/AuxiliaryExecutionTestHarness';
import { assertCatalogModelAvailable, modelCatalogCases } from '@test/helpers/providerModelCatalogs';
import { withRuntimeHosts } from '@test/helpers/providerRuntimeHost';

import { ProviderExecutionLifecycleRegistry } from '@/core/execution';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';

const titleCases = modelCatalogCases.map(provider => ({
  ...provider,
  forms: {
    deepseek: ['deepseek:native/selected', 'deepseek:native/selected'],
    omp: ['omp:anthropic/selected', 'omp/omp:anthropic/selected'],
  }[provider.id],
  expected: {
    deepseek: 'deepseek:native/selected',
    omp: 'omp:anthropic/selected',
  }[provider.id],
}));

beforeEach(() => jest.spyOn(ProviderWorkspaceRegistry, 'ensureInitialized').mockResolvedValue(undefined));
afterEach(() => jest.restoreAllMocks());

/** Runs one title generation over a fake backend; returns the requests it sent and its result callback. */
async function runTitleGeneration(settings: Record<string, unknown>, providerId: string) {
  const backend = new FakeAuxiliaryBackend();
  const createBackend = jest.spyOn(ProviderRegistry, 'createExecutionBackend').mockReturnValue(backend);
  const lifecycle = new ProviderExecutionLifecycleRegistry();
  const host = withRuntimeHosts({ settings, workingDirectory: '/vault', executionLifecycleRegistry: lifecycle });
  const service = ProviderRegistry.createTitleGenerationService(host);
  const callback = jest.fn();
  const generation = service.generateTitle('conversation', 'First message', callback);
  await waitFor(() => backend.sessions.some(session => session.requests.length > 0) || callback.mock.calls.length > 0);
  const requests = backend.sessions.flatMap(session => session.requests);
  if (requests.length > 0) expect(createBackend).toHaveBeenCalledWith(host, providerId);
  for (const session of backend.sessions) { session.emitText('A title'); session.complete(); }
  await generation;
  await lifecycle.dispose();
  return { requests, callback };
}

async function generateTitleModel(settings: Record<string, unknown>, providerId: string): Promise<string | undefined> {
  const { requests, callback } = await runTitleGeneration(settings, providerId);
  expect(callback).toHaveBeenCalledWith('conversation', expect.objectContaining({ success: true }));
  return requests[0]?.configuration.model;
}

it.each(titleCases)('$id routes equivalent title IDs without choosing a sibling', async ({ id, forms, expected, populate }) => {
  const settings: Record<string, unknown> = {};
  populate(settings);
  for (const model of forms) {
    settings.titleGenerationModel = model;
    expect(ProviderRegistry.resolveTitleGenerationSelection(settings)?.providerId).toBe(id);
    expect(await generateTitleModel(settings, id)).toBe(expected);
    expect(() => assertCatalogModelAvailable(id, settings, expected)).not.toThrow();
    settings.titleGenerationModel = `${model}/high`;
    expect(ProviderRegistry.resolveTitleGenerationSelection(settings)).toBeNull();
    settings.titleGenerationModel = `${model}-sibling`;
    expect(ProviderRegistry.resolveTitleGenerationSelection(settings)).toBeNull();
  }
});

it.each(titleCases)('$id rejects a title model cleared after routing instead of using a default', async ({ id, forms, populate }) => {
  const settings: Record<string, unknown> = {};
  populate(settings);
  settings.titleGenerationModel = forms[0];
  jest.mocked(ProviderWorkspaceRegistry.ensureInitialized).mockImplementation(async () => {
    settings.titleGenerationModel = '';
  });
  const { requests, callback } = await runTitleGeneration(settings, id);
  expect(requests).toHaveLength(0);
  expect(callback).toHaveBeenCalledWith('conversation', expect.objectContaining({ success: false }));
});

it.each(titleCases)('$id preserves omitted-model execution fallback without accepting an explicit missing model', ({ id, populate, selected }) => {
  const settings: Record<string, unknown> = { model: selected };
  populate(settings);
  expect(() => assertCatalogModelAvailable(id, settings, undefined)).not.toThrow();
  expect(() => assertCatalogModelAvailable(id, settings, 'missing-model')).toThrow(/unavailable/);
});
