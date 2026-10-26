import { migrateLegacyDshProviderSettings } from '@/app/settings/migrateLegacyDshProvider';

function legacySettings() {
  return {
    settingsProvider: 'dsh',
    model: 'dsh:["deepseek-account","deepseek-flash"]',
    titleGenerationModel: 'dsh:["deepseek-account","deepseek-flash"]',
    lastSelectedChatModel: { providerId: 'dsh', model: 'dsh:["deepseek-account","deepseek-flash"]' },
    inlineEditModel: { providerId: 'dsh', model: 'dsh:["deepseek-account","deepseek-flash"]', reasoning: 'high' },
    savedProviderModel: { dsh: 'dsh:["deepseek-account","deepseek-flash"]' },
    savedProviderEffort: { dsh: 'high' },
    savedProviderServiceTier: { dsh: 'default' },
    savedProviderPermissionMode: { dsh: 'yolo' },
    pendingProviderSessionInvalidations: { dsh: 12 },
    providerConfigs: {
      dsh: {
        enabled: true,
        cliPath: '/opt/homebrew/bin/dsh',
        cliPathsByHost: { host: '/opt/homebrew/bin/dsh' },
        environmentVariables: 'DSH_HOME=/tmp/.dsh',
        environmentHash: 'v1:abc',
        visibleModels: ['dsh:["deepseek-account","deepseek-flash"]'],
        modelAliases: { 'dsh:["deepseek-account","deepseek-flash"]': 'Flash' },
        preferredReasoningByModel: { 'dsh:["deepseek-account","deepseek-flash"]': 'high' },
        catalogsByHost: {
          host: {
            models: [{
              rawId: '["deepseek-account","deepseek-flash"]',
              displayName: 'DeepSeek Flash',
              supportsReasoning: true,
              reasoningEfforts: [{ value: 'high', label: 'High' }],
            }],
          },
        },
      },
    },
  };
}

test('moves the legacy dsh provider document onto deepseek', () => {
  const settings = legacySettings();
  const changed = migrateLegacyDshProviderSettings(settings as unknown as Record<string, unknown>);

  expect(changed).toBe(true);
  expect(settings.settingsProvider).toBe('deepseek');
  const configs = settings.providerConfigs as Record<string, Record<string, unknown> | undefined>;
  expect(configs.dsh).toBeUndefined();
  expect(configs.deepseek).toMatchObject({
    enabled: true,
    cliPath: '/opt/homebrew/bin/dsh',
    visibleModels: ['deepseek:deepseek-account/deepseek-flash'],
  });
  expect(configs.deepseek?.discoveredModels).toHaveLength(1);
  expect(settings.savedProviderModel).toEqual({ deepseek: 'deepseek:deepseek-account/deepseek-flash' });
  expect(settings.savedProviderEffort).toEqual({ deepseek: 'high' });
  expect(settings.savedProviderPermissionMode).toEqual({ deepseek: 'yolo' });
  expect(settings.pendingProviderSessionInvalidations).toEqual({ deepseek: 12 });
  expect(settings.lastSelectedChatModel).toEqual({ providerId: 'deepseek', model: 'deepseek:deepseek-account/deepseek-flash' });
  expect(settings.model).toBe('deepseek:deepseek-account/deepseek-flash');
});

test('keeps an existing deepseek configuration and is idempotent', () => {
  const settings = {
    providerConfigs: { dsh: { enabled: true }, deepseek: { enabled: false, cliPath: '/dsh' } },
  };
  migrateLegacyDshProviderSettings(settings as unknown as Record<string, unknown>);
  expect(settings.providerConfigs.deepseek).toMatchObject({ enabled: false, cliPath: '/dsh' });
  expect(migrateLegacyDshProviderSettings(settings as unknown as Record<string, unknown>)).toBe(false);
});
