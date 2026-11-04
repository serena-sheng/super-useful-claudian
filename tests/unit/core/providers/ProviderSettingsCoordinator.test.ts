import '@/providers';

import { ompCatalogFixture } from '@test/helpers/ompModels';

import { getProviderSettingsSnapshotWithModel } from '@/core/providers/conversationModel';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';

const OMP_MODEL = 'omp:anthropic/opus';
const OMP_ALT_MODEL = 'omp:anthropic/haiku';
const DEEPSEEK_MODEL = 'deepseek:native/selected';

function ompConfig() {
  const catalog = ompCatalogFixture(['anthropic/opus', 'anthropic/haiku'], ['off', 'low', 'medium', 'high']);
  return { enabled: true, discoveredModels: catalog.discoveredModels, visibleModels: catalog.visibleModels };
}

function deepseekConfig() {
  return {
    enabled: true,
    visibleModels: [DEEPSEEK_MODEL],
    discoveredModels: [{
      provider: 'native', id: 'selected', label: 'Selected',
      reasoning: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }],
    }],
  };
}

function settingsWith(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    settingsProvider: 'omp',
    model: OMP_MODEL,
    effortLevel: 'high',
    permissionMode: 'always-ask',
    savedProviderModel: { omp: OMP_MODEL },
    savedProviderEffort: { omp: 'high' },
    savedProviderPermissionMode: { omp: 'always-ask' },
    providerConfigs: { omp: ompConfig(), deepseek: deepseekConfig() },
    locale: 'en',
    ...overrides,
  };
}

describe('ProviderSettingsCoordinator', () => {
  it('commits only the target provider preferences without changing its selected model', () => {
    const settings = settingsWith();
    const before = getProviderSettingsSnapshotWithModel(settings, 'deepseek', DEEPSEEK_MODEL);
    const after = structuredClone(before) as Record<string, unknown>;
    after.effortLevel = 'low';
    after.locale = 'fr';
    (after.savedProviderModel as Record<string, string>).omp = 'wrong';
    const original = structuredClone(settings);
    ProviderSettingsCoordinator.commitProviderSettingsChange(
      settings, 'deepseek', before, after,
    );
    expect(settings).toEqual({ ...original, savedProviderEffort: { omp: 'high', deepseek: 'low' } });
  });

  describe('conversation model projection', () => {
    it('preserves a valid explicit reasoning choice when reading an existing conversation', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'deepseek',
        model: DEEPSEEK_MODEL,
        effortLevel: 'low',
        serviceTier: 'default',
        savedProviderModel: { deepseek: DEEPSEEK_MODEL },
        savedProviderEffort: { deepseek: 'low' },
        providerConfigs: { deepseek: deepseekConfig() },
      };

      const snapshot = getProviderSettingsSnapshotWithModel(settings, 'deepseek', DEEPSEEK_MODEL);

      expect(snapshot.effortLevel).toBe('low');
      expect(settings.effortLevel).toBe('low');
    });

    it('uses a saved provider reasoning preference before normalizing against the selected model', () => {
      const settings: Record<string, unknown> = {
        model: 'retired-model',
        savedProviderModel: { deepseek: DEEPSEEK_MODEL },
        savedProviderEffort: { deepseek: 'medium' },
        providerConfigs: { deepseek: deepseekConfig() },
      };

      const snapshot = getProviderSettingsSnapshotWithModel(settings, 'deepseek', DEEPSEEK_MODEL);

      expect(snapshot.model).toBe(DEEPSEEK_MODEL);
      expect(snapshot.effortLevel).toBe('medium');
    });
  });

  describe('selected model snapshot', () => {
    it('clamps an unsupported reasoning value to the selected model metadata', () => {
      const settings: Record<string, unknown> = {
        model: OMP_MODEL,
        effortLevel: 'xhigh',
        savedProviderModel: { omp: OMP_MODEL },
        savedProviderEffort: { omp: 'xhigh' },
        providerConfigs: { omp: ompConfig() },
      };

      const snapshot = getProviderSettingsSnapshotWithModel(settings, 'omp', OMP_MODEL);

      expect(snapshot.effortLevel).toBe('high');
      expect(snapshot.serviceTier).toBe('default');
    });
  });

  describe('normalizeProviderSelection', () => {
    it('falls back to the default provider when the stored provider is unknown', () => {
      const settings = settingsWith({ settingsProvider: 'retired-provider' });
      expect(ProviderSettingsCoordinator.normalizeProviderSelection(settings)).toBe(true);
      expect(settings.settingsProvider).toBe('omp');
    });

    it('returns false when already normalized (no-op)', () => {
      const settings = settingsWith();
      expect(ProviderSettingsCoordinator.normalizeProviderSelection(settings)).toBe(false);
    });
  });

  describe('applyProviderEnablement', () => {
    it('preflights the sole enabled provider without mutating settings', () => {
      const settings = settingsWith({ providerConfigs: { omp: ompConfig(), deepseek: { enabled: false } } });
      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(settings, 'deepseek', true)).toBe(true);
      expect(ProviderSettingsCoordinator.canApplyProviderEnablement(settings, 'omp', false)).toBe(false);
      const original = structuredClone(settings);
      expect(ProviderSettingsCoordinator.applyProviderEnablement(settings, 'omp', false)).toBe(false);
      expect(settings).toEqual(original);
    });

    it('atomically disables a provider and preserves dependent title selections', () => {
      const settings = settingsWith({
        titleGenerationModel: OMP_MODEL,
        savedProviderModel: { omp: OMP_MODEL, deepseek: DEEPSEEK_MODEL },
      });
      expect(ProviderSettingsCoordinator.applyProviderEnablement(settings, 'omp', false)).toBe(true);
      expect(settings.settingsProvider).toBe('deepseek');
      expect(settings.titleGenerationModel).toBe(OMP_MODEL);
    });
  });

  describe('reconcileTitleGenerationModelSelection', () => {
    it('stores an available title model in its provider runtime form', () => {
      const settings = settingsWith({ titleGenerationModel: OMP_ALT_MODEL });
      expect(ProviderSettingsCoordinator.reconcileTitleGenerationModelSelection(settings)).toBe(false);
      expect(settings.titleGenerationModel).toBe(OMP_ALT_MODEL);
    });

    it('preserves a title model when no enabled provider exposes it', () => {
      const settings = settingsWith({ titleGenerationModel: 'unknown-model' });
      expect(ProviderSettingsCoordinator.reconcileTitleGenerationModelSelection(settings)).toBe(false);
      expect(settings.titleGenerationModel).toBe('unknown-model');
    });
  });

  describe('projectActiveProviderState', () => {
    it('defaults a new OMP selection to always ask without inheriting another provider projection', () => {
      const settings = settingsWith({
        permissionMode: 'auto',
        savedProviderPermissionMode: {},
      });
      ProviderSettingsCoordinator.projectActiveProviderState(settings);
      expect(settings.permissionMode).toBe('always-ask');
    });

    it('preserves a saved permission mode for the settings provider', () => {
      const settings = settingsWith({ savedProviderPermissionMode: { omp: 'write' } });
      ProviderSettingsCoordinator.projectActiveProviderState(settings);
      expect(settings.permissionMode).toBe('write');
    });

    it('projects saved model and effort for the settings provider', () => {
      const settings = settingsWith({
        model: OMP_ALT_MODEL,
        savedProviderModel: { omp: OMP_ALT_MODEL },
        savedProviderEffort: { omp: 'low' },
      });
      settings.effortLevel = 'high';
      ProviderSettingsCoordinator.projectActiveProviderState(settings);
      expect(settings.model).toBe(OMP_ALT_MODEL);
      expect(settings.effortLevel).toBe('low');
    });

    it('defaults to the default provider when settingsProvider is not set', () => {
      const settings = settingsWith({ settingsProvider: undefined, model: OMP_MODEL });
      ProviderSettingsCoordinator.normalizeProviderSelection(settings);
      ProviderSettingsCoordinator.projectActiveProviderState(settings);
      expect(settings.settingsProvider).toBe('omp');
      expect(settings.model).toBe(OMP_MODEL);
    });

    it('handles missing saved maps gracefully', () => {
      const settings = settingsWith({
        savedProviderModel: undefined,
        savedProviderEffort: undefined,
        savedProviderPermissionMode: undefined,
      });
      expect(() => ProviderSettingsCoordinator.projectActiveProviderState(settings)).not.toThrow();
      expect(settings.model).toBe(OMP_MODEL);
    });
  });

  describe('persistProjectedProviderState', () => {
    it('stores the current top-level projection for the settings provider', () => {
      const settings = settingsWith({
        model: OMP_ALT_MODEL,
        effortLevel: 'medium',
        permissionMode: 'write',
      });
      ProviderSettingsCoordinator.persistProjectedProviderState(settings);
      expect(settings.savedProviderModel).toMatchObject({ omp: OMP_ALT_MODEL });
      expect(settings.savedProviderEffort).toMatchObject({ omp: 'medium' });
      expect(settings.savedProviderPermissionMode).toMatchObject({ omp: 'write' });
    });
  });

  describe('projectProviderState', () => {
    it('seeds a provider projection from provider defaults when no saved values exist', () => {
      const settings = settingsWith();
      delete settings.savedProviderModel;
      delete settings.savedProviderEffort;
      ProviderSettingsCoordinator.projectProviderState(settings, 'deepseek');
      expect(settings.model).toBe(DEEPSEEK_MODEL);
      expect(settings.effortLevel).toBe('high');
    });

    it('projects a saved unavailable model without clobbering the active provider projection', () => {
      const settings = settingsWith({
        savedProviderModel: { omp: OMP_MODEL, deepseek: 'deepseek:native/missing' },
        savedProviderEffort: { omp: 'high', deepseek: 'low' },
      });
      ProviderSettingsCoordinator.projectProviderState(settings, 'deepseek');
      expect(settings.model).toBe('deepseek:native/missing');
      const active = getProviderSettingsSnapshotWithModel(settings, 'omp', OMP_MODEL);
      expect(active.model).toBe(OMP_MODEL);
      expect(active.effortLevel).toBe('high');
    });
  });

  describe('provider-scoped reconciliation', () => {
    it('updates the inactive provider snapshot without clobbering the active projection', () => {
      const settings = settingsWith({
        savedProviderModel: { omp: OMP_MODEL, deepseek: DEEPSEEK_MODEL },
        savedProviderEffort: { omp: 'high', deepseek: 'low' },
      });
      ProviderSettingsCoordinator.reconcileProviders(settings, ['deepseek']);
      expect(settings.model).toBe(OMP_MODEL);
      expect(settings.effortLevel).toBe('high');
    });
  });

  it('exposes the default provider to settings consumers', () => {
    expect(ProviderRegistry.resolveSettingsProviderId({})).toBe('omp');
  });
});
