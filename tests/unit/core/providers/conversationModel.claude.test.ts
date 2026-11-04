import '@/providers';

import { getProviderSettingsSnapshotWithModel, resolveConversationModel } from '@/core/providers/conversationModel';
import type { Conversation } from '@/core/types';

describe('Claude unavailable model projections', () => {
  it('shows the same unavailable native model that execution will receive', () => {
    const settings = {
      model: 'sonnet', settingsProvider: 'omp',
      providerConfigs: { omp: {
        discoveredModels: [{ value: 'sonnet', label: 'Sonnet', description: '' }],
        visibleModels: ['sonnet'], defaultModel: 'sonnet',
      } },
    };
    const conversation = { providerId: 'omp', selectedModel: 'old-native-model' } as Conversation;
    const resolution = resolveConversationModel(settings, 'omp', conversation);
    expect(resolution.model).toBe('old-native-model');
    const snapshot = getProviderSettingsSnapshotWithModel(settings, 'omp', resolution.model);
    expect(snapshot.model).toBe('old-native-model');
    expect(settings.model).toBe('sonnet');
  });
});
