import '@/providers';

import { DEFAULT_CLAUDIAN_SETTINGS as DEFAULT_SETTINGS } from '@test/helpers/defaultSettings';
import { ompCatalogFixture } from '@test/helpers/ompModels';

import {
  CLAUDIAN_SETTINGS_PATH,
  ClaudianSettingsStorage
} from '@/app/settings/ClaudianSettingsStorage';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { getDeepSeekProviderSettings } from '@/providers/deepseek/settings';
import { getOmpProviderSettings } from '@/providers/omp/settings';

const mockGetHostnameKey = jest.fn(() => 'host-a');
const mockGetLegacyDeviceSettingsKey = jest.fn<string | null, []>(() => null);
const originalPlatform = process.platform;

const mockAdapter = {
  exists: jest.fn(),
  read: jest.fn(),
  write: jest.fn(),
  delete: jest.fn(),
} as unknown as jest.Mocked<VaultFileAdapter>;

jest.mock('@/core/device/InstallationKey', () => ({
  ...jest.requireActual('@/core/device/InstallationKey'),
  getInstallationKey: () => mockGetHostnameKey(),
  getLegacyDeviceSettingsKey: () => mockGetLegacyDeviceSettingsKey(),
}));

describe('ClaudianSettingsStorage', () => {
  let storage: ClaudianSettingsStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    // Reset mock implementations to default resolved values
    mockAdapter.exists.mockResolvedValue(false);
    mockAdapter.read.mockResolvedValue('{}');
    mockAdapter.write.mockResolvedValue(undefined);
    mockAdapter.delete.mockResolvedValue(undefined);
    mockGetHostnameKey.mockReturnValue('host-a');
    mockGetLegacyDeviceSettingsKey.mockReturnValue(null);
    storage = new ClaudianSettingsStorage(mockAdapter, DEFAULT_SETTINGS);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('load', () => {
    it('retires obsolete saved settings while preserving current settings and provider configuration', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        ...DEFAULT_SETTINGS,
        persistentExternalContextPaths: ['/old/project'],
        maxWarmAgentProcesses: 7,
        projectSort: 'created',
        userName: 'Ada',
        providerConfigs: { omp: { environmentVariables: 'OMP_TEST=1' } },
      }));

      const loaded = await storage.load();
      const written = JSON.parse(mockAdapter.write.mock.calls.at(-1)![1]);

      expect(loaded.userName).toBe('Ada');
      expect(written.userName).toBe('Ada');
      expect(written.providerConfigs.omp.environmentVariables).toBe('OMP_TEST=1');
      expect(loaded).not.toHaveProperty('persistentExternalContextPaths');
      expect(written).not.toHaveProperty('persistentExternalContextPaths');
      expect(loaded).not.toHaveProperty('maxWarmAgentProcesses');
      expect(written).not.toHaveProperty('maxWarmAgentProcesses');
      expect(written).not.toHaveProperty('projectSort');
    });


    it('should return defaults when file does not exist', async () => {
      mockAdapter.exists.mockResolvedValue(false);

      const result = await storage.load();

      expect(result.model).toBe(DEFAULT_SETTINGS.model);
      expect(result.permissionMode).toBe(DEFAULT_SETTINGS.permissionMode);
      expect(result.requireCommandOrControlEnterToSend).toBe(false);
      expect(result.titleGenerationLocale).toBe('');
      expect(result.lastSelectedChatModel).toBeNull();
      expect(result.enableDualPane).toBe(true);
      expect(result.dualPaneSide).toBe('right');
      expect(result.restoreTabsOnStartup).toBe(true);
      expect(result.enableZenMode).toBe(true);
      expect(mockAdapter.read).not.toHaveBeenCalled();
    });

    it('ignores retired .claude settings without modifying them', async () => {
      mockAdapter.exists.mockImplementation(async path => path === '.claude/claudian-settings.json');
      mockAdapter.read.mockResolvedValue(JSON.stringify({ userName: 'Retired' }));
      expect((await storage.load()).userName).toBe(DEFAULT_SETTINGS.userName);
      expect(mockAdapter.read).not.toHaveBeenCalled();
      expect(mockAdapter.write).not.toHaveBeenCalled();
      expect(mockAdapter.delete).not.toHaveBeenCalled();
    });

    it('should parse valid JSON and merge with defaults', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        model: 'omp:anthropic/claude-opus-4-5',
        userName: 'TestUser',
      }));

      const result = await storage.load();

      expect(result.model).toBe('omp:anthropic/claude-opus-4-5');
      expect(result.userName).toBe('TestUser');
      // Defaults should still be present for unspecified fields
      expect(result.effortLevel).toBe(DEFAULT_SETTINGS.effortLevel);
    });

    it('preserves an explicitly stored provider-qualified chat model selection', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        lastSelectedChatModel: {
          providerId: 'omp',
          model: 'omp:anthropic/gpt-5',
        },
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toEqual({
        providerId: 'omp',
        model: 'omp:anthropic/gpt-5',
      });
    });

    it('preserves an explicitly stored null chat model selection', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        lastSelectedChatModel: null,
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toBeNull();
      expect(mockAdapter.write).not.toHaveBeenCalled();
    });

    it('normalizes a malformed stored chat model selection to null', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        lastSelectedChatModel: {
          providerId: 'omp',
          model: 42,
        },
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.lastSelectedChatModel).toBeNull();
      expect(writtenContent.lastSelectedChatModel).toBeNull();
    });

    it.each([
      {
        stored: { providerId: 'omp', model: 'omp:anthropic/gpt-5', reasoning: 'low' },
        expected: { providerId: 'omp', model: 'omp:anthropic/gpt-5', reasoning: 'low' },
      },
      { stored: { providerId: 'omp', model: 'omp:anthropic/gpt-5', reasoning: 7 }, expected: { providerId: 'omp', model: 'omp:anthropic/gpt-5' } },
      { stored: { providerId: 'omp', model: 42 }, expected: null },
      { stored: undefined, expected: null },
    ])('loads the inline edit default model $stored as $expected', async ({ stored, expected }) => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify(stored === undefined ? {} : { inlineEditModel: stored }));

      expect((await storage.load()).inlineEditModel).toEqual(expected);
    });

    it('migrates the live top-level model for the stored settings provider', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        settingsProvider: 'omp',
        model: 'omp:anthropic/gpt-5.7',
        savedProviderModel: {
          omp: 'omp:anthropic/gpt-5.6',
        },
        providerConfigs: {
          omp: { enabled: true },
        },
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toEqual({
        providerId: 'omp',
        model: 'omp:anthropic/gpt-5.7',
      });
      expect(mockAdapter.write).toHaveBeenCalled();
    });

    it('uses the saved provider model when the legacy live projection is empty', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        settingsProvider: 'omp',
        model: '',
        savedProviderModel: {
          omp: 'omp:anthropic/gpt-5.6',
        },
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toEqual({
        providerId: 'omp',
        model: 'omp:anthropic/gpt-5.6',
      });
    });

    it('preserves a legacy seed for a disabled registered provider', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        settingsProvider: 'deepseek',
        model: 'deepseek:native/seed',
        providerConfigs: {
          deepseek: { enabled: false },
        },
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toEqual({
        providerId: 'deepseek',
        model: 'deepseek:native/seed',
      });
    });

    it('uses the default chat provider for an unknown legacy provider only when a top-level model exists', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        settingsProvider: 'unknown-provider',
        model: 'omp:anthropic/haiku',
      }));

      const result = await storage.load();

      expect(result.lastSelectedChatModel).toEqual({
        providerId: 'omp',
        model: 'omp:anthropic/haiku',
      });
    });

    it('ignores retired placement and flat provider settings', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({ openInMainTab: true, claudeCliPath: '/retired', codexCliPath: '/retired', environmentVariables: 'ANTHROPIC_API_KEY=retired\nHTTP_PROXY=retired', hiddenSlashCommands: ['retired'] }));
      const result = await storage.load();
      expect(result.chatViewPlacement).toBe(DEFAULT_SETTINGS.chatViewPlacement);
      expect(getOmpProviderSettings(result).cliPath).toBe('');
      expect(getDeepSeekProviderSettings(result).cliPath).toBe('');
      expect(getOmpProviderSettings(result).environmentVariables).toBe('');
      expect(result.sharedEnvironmentVariables).toBe('');
      expect(result.hiddenCommands).toEqual([]);
    });

    it('normalizes invalid chatViewPlacement values', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        chatViewPlacement: 'floating-window',
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.chatViewPlacement).toBe('right-sidebar');
      expect(writtenContent.chatViewPlacement).toBe('right-sidebar');
    });

    it('normalizes dual-pane preferences and removes the legacy file pane setting', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        enableDualPane: 'yes',
        enableFilePane: 'yes',
        dualPaneSide: 'top',
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.enableDualPane).toBe(true);
      expect(result.dualPaneSide).toBe('right');
      expect(result).not.toHaveProperty('enableFilePane');
      expect(writtenContent.enableDualPane).toBe(true);
      expect(writtenContent.dualPaneSide).toBe('right');
      expect(writtenContent).not.toHaveProperty('enableFilePane');
    });

    it('normalizes invalid startup tab restore values', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        restoreTabsOnStartup: 'yes',
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.restoreTabsOnStartup).toBe(true);
      expect(writtenContent.restoreTabsOnStartup).toBe(true);
    });

    it('preserves a disabled startup tab restore toggle', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        restoreTabsOnStartup: false,
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.restoreTabsOnStartup).toBe(false);
      expect(writtenContent.restoreTabsOnStartup).toBe(false);
    });

    it.each([
      ['missing', {}, true],
      ['disabled', { enableZenMode: false }, false],
      ['enabled', { enableZenMode: true }, true],
    ])('loads a %s zen mode preference', async (_label, stored, expected) => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify(stored));

      const result = await storage.load();

      expect(result.enableZenMode).toBe(expected);
      const writtenValues = mockAdapter.write.mock.calls
        .map(([, content]) => (JSON.parse(content) as Record<string, unknown>).enableZenMode)
        .filter(value => value !== undefined);
      expect(writtenValues.every(value => value === expected)).toBe(true);
    });

    it('persists a normalized invalid zen mode preference', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({ enableZenMode: 'yes' }));

      const result = await storage.load();

      expect(result.enableZenMode).toBe(true);
      expect(JSON.parse(mockAdapter.write.mock.calls.at(-1)![1]).enableZenMode).toBe(true);
    });

    it.each([
      ['missing', {}, null],
      ['docked', { zenModePosition: null }, null],
      ['moved', { zenModePosition: { x: -0.2, y: 0.375 } }, { x: -0.2, y: 0.375 }],
      ['malformed', { zenModePosition: { x: '1', y: 0.5 } }, null],
    ])('loads a %s zen panel position', async (_label, stored, expected) => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify(stored));

      const result = await storage.load();

      expect(result.zenModePosition).toEqual(expected);
    });

    it('normalizes omp provider CLI paths from loaded data', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        providerConfigs: {
          omp: {
            cliPathsByHost: {
              'host-a': '/custom/path-a',
              'host-b': '/custom/path-b',
            },
          },
        },
      }));

      const result = await storage.load();

      expect(getOmpProviderSettings(result).cliPathsByHost['host-a']).toBe('/custom/path-a');
      expect(getOmpProviderSettings(result).cliPathsByHost['host-b']).toBe('/custom/path-b');
    });

    it('normalizes deepseek provider CLI paths from loaded data', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        providerConfigs: {
          deepseek: {
            cliPathsByHost: {
              'host-a': '/custom/deepseek-a',
              'host-b': '/custom/deepseek-b',
            },
          },
        },
      }));

      const result = await storage.load();

      expect(getDeepSeekProviderSettings(result).cliPathsByHost['host-a']).toBe('/custom/deepseek-a');
      expect(getDeepSeekProviderSettings(result).cliPathsByHost['host-b']).toBe('/custom/deepseek-b');
    });

    it('preserves hostname-scoped provider settings without assigning them to the current device', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockGetHostnameKey.mockReturnValue('device:current');
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        lastSelectedChatModel: null,
        providerConfigs: {
          omp: {
            cliPathsByHost: {
              'host-a': '/custom/omp-a',
              'host-b': '/custom/omp-b',
            },
          },
          deepseek: {
            cliPathsByHost: {
              'host-a': '/custom/deepseek-a',
              'host-b': '/custom/deepseek-b',
            },
          },
        },
      }));

      const result = await storage.load();
      const ompSettings = getOmpProviderSettings(result);
      const deepseekSettings = getDeepSeekProviderSettings(result);
      const persistedDeepSeekConfig = result.providerConfigs.deepseek as Record<string, unknown>;

      expect(ompSettings.cliPathsByHost).toEqual({
        'host-a': '/custom/omp-a',
        'host-b': '/custom/omp-b',
      });
      expect(deepseekSettings.cliPathsByHost).toEqual({
        'host-a': '/custom/deepseek-a',
        'host-b': '/custom/deepseek-b',
      });
      expect(persistedDeepSeekConfig.cliPathsByHost).toEqual({
        'host-a': '/custom/deepseek-a',
        'host-b': '/custom/deepseek-b',
      });
      expect(mockAdapter.write).toHaveBeenCalledTimes(1);
    });

    it('migrates current-device provider maps from the colon key to the portable key', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockGetHostnameKey.mockReturnValue('device-portable');
      mockGetLegacyDeviceSettingsKey.mockReturnValue('device:legacy');
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        lastSelectedChatModel: null,
        providerConfigs: {
          omp: {
            cliPathsByHost: {
              'device:legacy': '/legacy/omp',
              'device:other': '/other/omp',
            },
          },
          deepseek: {
            cliPathsByHost: {
              'device:legacy': '/legacy/deepseek',
              'device-portable': '/portable/deepseek',
            },
          },
        },
      }));

      const result = await storage.load();
      const ompSettings = getOmpProviderSettings(result);
      const deepseekSettings = getDeepSeekProviderSettings(result);
      const persisted = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(ompSettings.cliPathsByHost).toEqual({
        'device-portable': '/legacy/omp',
        'device:other': '/other/omp',
      });
      expect(deepseekSettings.cliPathsByHost).toEqual({
        'device-portable': '/portable/deepseek',
      });
      expect(persisted.providerConfigs.omp.cliPathsByHost)
        .toEqual(ompSettings.cliPathsByHost);
      expect(persisted.providerConfigs.deepseek.cliPathsByHost)
        .toEqual(deepseekSettings.cliPathsByHost);
    });

    it('merges per-provider hidden commands into one global list and retires the old key', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        hiddenProviderCommands: {
          omp: ['commit', '/Review'],
          deepseek: ['skill:review', 'review'],
        },
        hiddenSlashCommands: ['legacy'],
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.hiddenCommands).toEqual(['commit', 'Review', 'skill:review']);
      expect(writtenContent.hiddenCommands).toEqual(['commit', 'Review', 'skill:review']);
      expect(writtenContent).not.toHaveProperty('hiddenProviderCommands');
      expect(result).not.toHaveProperty('hiddenProviderCommands');
    });

    it('loads the vault-wide skills sync flag as a boolean', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({}));
      expect((await storage.load()).skillsSynced).toBe(false);

      mockAdapter.read.mockResolvedValue(JSON.stringify({ skillsSynced: true }));
      expect((await storage.load()).skillsSynced).toBe(true);

      mockAdapter.read.mockResolvedValue(JSON.stringify({ skillsSynced: 'yes' }));
      expect((await storage.load()).skillsSynced).toBe(false);
    });

    it('keeps an existing global hidden list over a stale per-provider map', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        hiddenCommands: ['kept', ' /kept ', ''],
        hiddenProviderCommands: { omp: ['stale'] },
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.hiddenCommands).toEqual(['kept']);
      expect(writtenContent.hiddenCommands).toEqual(['kept']);
      expect(writtenContent).not.toHaveProperty('hiddenProviderCommands');
    });

    it('preserves explicit scope on stored mixed environment snippets', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        envSnippets: [{
          id: 'snippet-1',
          name: 'Mixed snippet',
          description: '',
          envVars: 'PATH=/usr/local/bin\nANTHROPIC_MODEL=claude-custom',
          scope: 'shared',
        }],
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result.envSnippets).toEqual([{
        id: 'snippet-1',
        name: 'Mixed snippet',
        description: '',
        envVars: 'PATH=/usr/local/bin\nANTHROPIC_MODEL=claude-custom',
        scope: 'shared',
        contextLimits: undefined,
        modelAliases: undefined,
      }]);
      expect(writtenContent.envSnippets[0].scope).toBe('shared');
    });

    it('normalizes custom model aliases on load', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(JSON.stringify({
        providerConfigs: {
          omp: {
            visibleModels: ['omp:anthropic/custom-model'],
            discoveredModels: [{ id: 'custom-model', label: 'Custom', provider: 'anthropic', input: ['text'] }],
            modelAliases: {
              ' omp:anthropic/custom-model ': '  Friendly model  ',
              empty: '   ',
              ignored: 123,
            },
          },
        },
        envSnippets: [{
          id: 'snippet-1',
          name: 'Aliased snippet',
          description: '',
          envVars: 'ANTHROPIC_MODEL=custom-model',
          modelAliases: {
            ' custom-model ': '  Snippet model  ',
            ignored: 123,
          },
        }],
      }));

      const result = await storage.load();
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);

      expect(result).not.toHaveProperty('customModelAliases');
      expect(result.providerConfigs.omp?.modelAliases).toEqual({
        'omp:anthropic/custom-model': 'Friendly model',
      });
      expect(result.envSnippets[0].modelAliases).toEqual({
        'custom-model': 'Snippet model',
      });
      // Only the selected model's alias persists, and it is normalized.
      expect(writtenContent.providerConfigs.omp.modelAliases).toEqual({
        'omp:anthropic/custom-model': 'Friendly model',
      });
      expect(writtenContent.envSnippets[0].modelAliases).toEqual({
        'custom-model': 'Snippet model',
      });
    });

    it('should throw on JSON parse error', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue('invalid json');

      await expect(storage.load()).rejects.toThrow();
    });

    it('should throw on read error', async () => {
      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockRejectedValue(new Error('Read failed'));

      await expect(storage.load()).rejects.toThrow('Read failed');
    });
  });

  describe('save', () => {
    it('should write settings to file', async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        model: 'omp:anthropic/claude-opus-4-5',
      };

      await storage.save(settings);

      expect(mockAdapter.write).toHaveBeenCalledWith(
        CLAUDIAN_SETTINGS_PATH,
        expect.any(String)
      );
      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      expect(writtenContent.model).toBe('omp:anthropic/claude-opus-4-5');
      expect(writtenContent.providerConfigs.omp).not.toHaveProperty('discoveredModels');
      expect(writtenContent.providerConfigs.omp.selectedModels).toEqual([]);
      expect(writtenContent.providerConfigs.deepseek).not.toHaveProperty('discoveredModels');
    });

    it('persists only selected omp metadata with hand-picked model IDs', async () => {
      const catalog = ompCatalogFixture(['anthropic/gpt-5.5', 'anthropic/gpt-5.4-mini']);
      const settings = {
        ...DEFAULT_SETTINGS,
        providerConfigs: {
          ...DEFAULT_SETTINGS.providerConfigs,
          omp: {
            ...DEFAULT_SETTINGS.providerConfigs.omp,
            ...catalog,
            visibleModels: ['omp:anthropic/gpt-5.4-mini'],
          },
        },
      };

      await storage.save(settings);

      const writtenContent = JSON.parse(mockAdapter.write.mock.calls[0][1]);
      const decoded = getOmpProviderSettings(settings).discoveredModels;
      expect(writtenContent.providerConfigs.omp.selectedModels).toEqual([decoded[1]]);
      expect(writtenContent.providerConfigs.omp.visibleModels).toEqual(['omp:anthropic/gpt-5.4-mini']);
      expect(decoded).toHaveLength(2);
    });

    it('preserves omp model aliases and catalog across restart', async () => {
      const catalog = ompCatalogFixture(['anthropic/gpt-5.5', 'anthropic/gpt-5.4-mini']);
      const settings = {
        ...DEFAULT_SETTINGS,
        providerConfigs: {
          ...DEFAULT_SETTINGS.providerConfigs,
          omp: {
            ...DEFAULT_SETTINGS.providerConfigs.omp,
            ...catalog,
            modelAliases: {
              'omp:anthropic/gpt-5.5': 'Primary',
            },
            visibleModels: catalog.visibleModels,
          },
        },
      };

      await storage.save(settings);
      const persistedContent = mockAdapter.write.mock.calls[0][1];
      const persistedSettings = JSON.parse(persistedContent);
      const decoded = getOmpProviderSettings(settings).discoveredModels;
      expect(persistedSettings.providerConfigs.omp.selectedModels).toEqual(decoded);
      expect(persistedSettings.providerConfigs.omp.modelAliases).toEqual({
        'omp:anthropic/gpt-5.5': 'Primary',
      });

      mockAdapter.exists.mockResolvedValue(true);
      mockAdapter.read.mockResolvedValue(persistedContent);
      const reloaded = await storage.load();

      expect(getOmpProviderSettings(reloaded).modelAliases).toEqual({
        'omp:anthropic/gpt-5.5': 'Primary',
      });
      expect(getOmpProviderSettings(reloaded).discoveredModels).toEqual(decoded);
      getOmpProviderSettings(reloaded);
      expect(getOmpProviderSettings(reloaded).modelAliases).toEqual({
        'omp:anthropic/gpt-5.5': 'Primary',
      });
    });

    it('should throw on write error', async () => {
      mockAdapter.write.mockRejectedValue(new Error('Write failed'));

      await expect(storage.save(DEFAULT_SETTINGS)).rejects.toThrow('Write failed');
    });
  });
});

function createAdapter(
  stored: Record<string, unknown>,
): jest.Mocked<VaultFileAdapter> {
  return {
    exists: jest.fn().mockImplementation(async (path: string) => (
      path === CLAUDIAN_SETTINGS_PATH
    )),
    read: jest.fn().mockResolvedValue(JSON.stringify(stored)),
    write: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<VaultFileAdapter>;
}

describe('ClaudianSettingsStorage Linked content migration', () => {
  it('imports legacy organization and pinned paths before defaults and awaits canonical persistence', async () => {
    const adapter = createAdapter({
      sessionManagerOrganization: 'linked-note',
      pinnedLinkedNotePaths: [
        'Notes\\Plan.md',
        './Notes/Plan.md',
        'Projects//Research',
        '../outside',
      ],
    });
    let releaseWrite!: () => void;
    let signalWriteStarted!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    adapter.write.mockImplementation(() => new Promise<void>((resolve) => {
      signalWriteStarted();
      releaseWrite = resolve;
    }));
    const storage = new ClaudianSettingsStorage(adapter, DEFAULT_SETTINGS);

    let resolved = false;
    const load = storage.load().then((settings) => {
      resolved = true;
      return settings;
    });
    await writeStarted;

    expect(adapter.write).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    releaseWrite();

    await expect(load).resolves.toMatchObject({
      sessionManagerOrganization: 'linked-content',
      pinnedLinkedContentPaths: [
        'Notes/Plan.md',
        'Projects/Research',
      ],
    });
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.sessionManagerOrganization).toBe('linked-content');
    expect(persisted.pinnedLinkedContentPaths).toEqual([
      'Notes/Plan.md',
      'Projects/Research',
    ]);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('lets an explicitly stored canonical empty list win over legacy pins', async () => {
    const adapter = createAdapter({
      pinnedLinkedContentPaths: [],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });
    const storage = new ClaudianSettingsStorage(adapter, DEFAULT_SETTINGS);

    const settings = await storage.load();

    expect(settings.pinnedLinkedContentPaths).toEqual([]);
    expect(adapter.write).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual([]);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('normalizes canonical pins without falling back to the legacy field', async () => {
    const adapter = createAdapter({
      pinnedLinkedContentPaths: [
        'Projects\\Current',
        './Projects/Current',
        '../invalid',
      ],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });
    const storage = new ClaudianSettingsStorage(adapter, DEFAULT_SETTINGS);

    const settings = await storage.load();

    expect(settings.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    const persisted = JSON.parse(adapter.write.mock.calls[0][1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });

  it('omits legacy pinned paths from future writes', async () => {
    const adapter = createAdapter({});
    const storage = new ClaudianSettingsStorage(adapter, DEFAULT_SETTINGS);

    await storage.save({
      ...await storage.load(),
      pinnedLinkedContentPaths: ['Projects/Current'],
      pinnedLinkedNotePaths: ['Notes/Legacy.md'],
    });

    const persisted = JSON.parse(adapter.write.mock.calls.at(-1)![1]);
    expect(persisted.pinnedLinkedContentPaths).toEqual(['Projects/Current']);
    expect(persisted).not.toHaveProperty('pinnedLinkedNotePaths');
  });
});

describe('ClaudianSettingsStorage project settings', () => {
  it('replaces the retired projects organization with the default', async () => {
    const adapter = createAdapter({ sessionManagerOrganization: 'projects' });

    const settings = await new ClaudianSettingsStorage(adapter, DEFAULT_SETTINGS).load();

    expect(settings.sessionManagerOrganization).toBe('list');
    const written = JSON.parse(adapter.write.mock.calls.at(-1)![1]);
    expect(written.sessionManagerOrganization).toBe('list');
  });

});
