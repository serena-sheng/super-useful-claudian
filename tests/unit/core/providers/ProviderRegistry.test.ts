import '@/providers';

import { ompCatalogFixture} from '@test/helpers/ompModels';

import { ProviderRegistry} from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry} from '@/core/providers/ProviderWorkspaceRegistry';
import { updateOmpProviderSettings} from '@/providers/omp/settings';


describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderWorkspaceRegistry.clear();
    ProviderWorkspaceRegistry.setServices('omp', {
    } as any);
    jest.spyOn(ProviderWorkspaceRegistry, 'ensureInitialized')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns capabilities for the default provider', () => {
    const caps = ProviderRegistry.getCapabilities();
    expect(caps.providerId).toBe('omp');
    expect(caps).toHaveProperty('supportsFork');
  });

  it('throws when an unknown provider is requested', () => {
    expect(() => ProviderRegistry.getCapabilities(
      'nonexistent' as any,
    )).toThrow('Provider "nonexistent" is not registered.');
  });

  it('returns DeepSeek Harness capabilities', () => {
    const caps = ProviderRegistry.getCapabilities('deepseek');
    expect(caps.providerId).toBe('deepseek');
    expect(caps.supportsFork).toBe(true);
    expect(caps.startsSharedRuntimeOnTabPresence).toBe(true);
    expect(caps.reasoningControl).toBe('effort');
  });

  it('returns OMP capabilities', () => {
    const caps = ProviderRegistry.getCapabilities('omp');
    expect(caps.providerId).toBe('omp');
    expect(caps.supportsProviderCommands).toBe(true);
    expect(caps.supportsImageAttachments).toBe(true);
    expect(caps.supportsTurnSteer).toBe(true);
    expect(caps.supportsFork).toBe(true);
  });

  it('registers provider-owned subagent protocols outside the capability matrix', () => {
    const deepseekAdapter = ProviderRegistry.getSubagentAdapter('deepseek');
    expect(deepseekAdapter).toMatchObject({
      protocol: 'lifecycle',
    });
    expect(deepseekAdapter?.isSpawnTool('spawn_agent')).toBe(true);
    expect(deepseekAdapter?.isSpawnTool('Agent')).toBe(false);
    expect(deepseekAdapter?.isSpawnTool('Task')).toBe(false);

    expect(ProviderRegistry.getSubagentAdapter('omp')).toBeNull();
    for (const providerId of ['deepseek', 'omp'] as const) {
      expect(ProviderRegistry.getCapabilities(providerId)).not.toHaveProperty(
        'supportsLegacySubagentTools',
      );
    }
  });

  it('lists registered provider ids', () => {
    expect(ProviderRegistry.getRegisteredProviderIds()).toEqual(['deepseek', 'omp']);
  });

  it('filters enabled provider ids using registration metadata', () => {
    const deepseekEnabled = (enabled: boolean) => ({ providerConfigs: { deepseek: { enabled } } });
    expect(ProviderRegistry.getEnabledProviderIds(deepseekEnabled(false))).toEqual(['omp']);
    expect(ProviderRegistry.getEnabledProviderIds(deepseekEnabled(true))).toContain('deepseek');
    expect(ProviderRegistry.getEnabledProviderIds(deepseekEnabled(true))).toContain('omp');
    expect(ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
        omp: { enabled: false },
      },
    })).toEqual(['deepseek']);
    expect(ProviderRegistry.getEnabledProviderIds({ providerConfigs: { omp: { enabled: false } } })).toEqual([]);
  });

  it('exposes the blank-tab default-provider priority', () => {
    expect(ProviderRegistry.getBlankTabProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
        omp: { enabled: true },
      },
    })).toEqual(['omp', 'deepseek']);
    expect(ProviderRegistry.getBlankTabProviderIds({
      providerConfigs: {
        deepseek: { enabled: true },
        omp: { enabled: false },
      },
    })).toEqual(['deepseek']);
  });

  it('exposes title generation models only from enabled providers', () => {
    const catalog = ompCatalogFixture(['anthropic/selected', 'anthropic/unselected']);
    const disabledSettings = {
      providerConfigs: {
        omp: { enabled: false, visibleModels: catalog.visibleModels, discoveredModels: catalog.discoveredModels },
      },
    };
    const enabledSettings = {
      providerConfigs: {
        omp: { enabled: true, visibleModels: catalog.visibleModels, discoveredModels: catalog.discoveredModels },
      },
    };

    expect(
      ProviderRegistry.getTitleGenerationModelOptions(disabledSettings)
        .some(option => option.value === 'omp:anthropic/selected'),
    ).toBe(false);
    expect(
      ProviderRegistry.getTitleGenerationModelOptions(enabledSettings)
        .some(option => option.value === 'omp:anthropic/selected'),
    ).toBe(true);

    expect(
      ProviderRegistry.getTitleGenerationModelOptions(disabledSettings)
        .some(option => option.value === 'omp:anthropic/unselected'),
    ).toBe(false);
  });

  it('prefixes title generation model labels with their provider names', () => {
    const catalog = ompCatalogFixture(['anthropic/selected']);
    const options = ProviderRegistry.getTitleGenerationModelOptions({
      providerConfigs: {
        omp: { enabled: true, visibleModels: catalog.visibleModels, discoveredModels: catalog.discoveredModels },
        deepseek: {
          enabled: true,
          visibleModels: ['deepseek:native/selected'],
          discoveredModels: [{ encodedId: 'deepseek:native/selected', id: 'selected', provider: 'native', providerName: 'Native', label: 'Selected label', reasoning: [] }],
        },
      },
    });

    expect(options.find(option => option.value === 'omp:anthropic/selected')?.label)
      .toBe('OMP: anthropic/selected');
    expect(options.find(option => option.value === 'deepseek:native/selected')?.label)
      .toBe('DeepSeek Harness: Native/Selected label');
  });

  it('returns the display name from provider registration metadata', () => {
    expect(ProviderRegistry.getProviderDisplayName('omp')).toBe('OMP');
    expect(ProviderRegistry.getProviderDisplayName('deepseek')).toBe('DeepSeek Harness');
  });

  it('requires an explicit title model instead of selecting the default provider automatically', async () => {
    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        titleGenerationModel: '',
        providerConfigs: {
          omp: { enabled: true },
        },
      },
    } as any);
    const callback = jest.fn();

    await service.generateTitle('conv-1', 'hello', callback);

    expect(ProviderWorkspaceRegistry.ensureInitialized).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: false,
      error: expect.stringContaining('Select an available title model'),
    });
  });

  it('does not select another provider when the title model is empty', async () => {
    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        settingsProvider: 'deepseek',
        titleGenerationModel: '',
        providerConfigs: {
          omp: { enabled: true },
          deepseek: { enabled: true },
        },
      },
    } as any);

    const callback = jest.fn();
    await service.generateTitle('conv-1', 'hello', callback);

    expect(ProviderWorkspaceRegistry.ensureInitialized).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: false,
      error: expect.stringContaining('Select an available title model'),
    });
  });

  it('rejects a disabled title selection before initializing its provider', async () => {
    const settings: Record<string, unknown> = {};
    updateOmpProviderSettings(settings, {
      enabled: false,
      visibleModels: ['omp:anthropic/selected'],
      discoveredModels: ompCatalogFixture(['anthropic/selected']).discoveredModels as any,
    });
    const service = ProviderRegistry.createTitleGenerationService({
      settings: {
        ...settings,
        titleGenerationModel: 'omp:anthropic/selected',
      },
    } as any);

    const callback = jest.fn();
    await service.generateTitle('conv-1', 'hello', callback);

    expect(ProviderWorkspaceRegistry.ensureInitialized).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: false,
      error: expect.stringContaining('Select an available title model'),
    });
  });

  it.each(['unknown-title-model', 'omp:anthropic/selected'])(
    'preserves an unavailable title selection without starting a provider: %s',
    async titleGenerationModel => {
      const settings = {
        titleGenerationModel,
        providerConfigs: {
          omp: { enabled: true, ...ompCatalogFixture(['anthropic/selected']), visibleModels: [] },
        },
      };
      const callback = jest.fn();
      const service = ProviderRegistry.createTitleGenerationService({ settings } as any);
      await service.generateTitle('conversation', 'hello', callback);
      expect(ProviderWorkspaceRegistry.ensureInitialized).not.toHaveBeenCalled();
      expect(settings.titleGenerationModel).toBe(titleGenerationModel);
      expect(callback).toHaveBeenCalledWith('conversation', {
        success: false,
        error: expect.stringContaining('Select an available title model'),
      });
    },
  );

  it('rechecks title availability after provider initialization', async () => {
    const settings = {
      titleGenerationModel: 'omp:anthropic/selected',
      providerConfigs: {
        omp: { enabled: true, ...ompCatalogFixture(['anthropic/selected']), visibleModels: ['omp:anthropic/selected'] },
      },
    };
    jest.mocked(ProviderWorkspaceRegistry.ensureInitialized).mockImplementation(async () => {
      settings.providerConfigs.omp.enabled = false;
    });
    const createBackend = jest.spyOn(ProviderRegistry, 'createExecutionBackend');
    const service = ProviderRegistry.createTitleGenerationService({ settings } as any);
    const callback = jest.fn();
    await service.generateTitle('conversation', 'hello', callback);
    expect(createBackend).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith('conversation', {
      success: false,
      error: expect.stringContaining('became unavailable'),
    });
  });
});
