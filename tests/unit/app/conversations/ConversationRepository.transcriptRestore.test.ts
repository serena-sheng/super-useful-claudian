import '@/providers';

import { ConversationRepository } from '@/app/conversations/ConversationRepository';
import type { ConversationPersistence } from '@/app/storage/ConversationPersistenceStore';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { ProviderConversationHistoryService } from '@/core/providers/types';
import type { ChatMessage, Conversation } from '@/core/types';

function archived(): ChatMessage[] {
  return [
    { id: 'user-1', role: 'user', content: 'first question', timestamp: 1 },
    { id: 'assistant-1', role: 'assistant', content: 'first answer', timestamp: 2 },
    { id: 'user-2', role: 'user', content: 'second question', timestamp: 3 },
  ];
}

function createRepository(history: Partial<ProviderConversationHistoryService>) {
  const conversation: Conversation = {
    id: 'conv-1', providerId: 'claude', title: 'Archived', createdAt: 1, lastActivityAt: 4,
    sessionId: 'native-1', messages: [],
  };
  const persistence = {
    metadataReader: {
      revalidate: jest.fn().mockResolvedValue([]), load: jest.fn().mockResolvedValue(null),
      scan: jest.fn().mockResolvedValue({ records: [], complete: true, invalidMetadataCount: 0 }),
      loadMetadata: jest.fn().mockResolvedValue(null),
      scanMetadata: jest.fn().mockResolvedValue({ metadata: [], complete: true, invalidMetadataCount: 0 }),
      listMetadata: jest.fn().mockResolvedValue([]),
    },
    transcripts: {
      save: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(archived()),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    saveMetadata: jest.fn().mockResolvedValue(undefined),
    deleteCurrentMetadata: jest.fn().mockResolvedValue(undefined),
    assignMetadataToDevice: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ConversationPersistence>;
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(
    history as ProviderConversationHistoryService,
  );
  const repository = new ConversationRepository({
    providers: ProviderRegistry,
    providerSettings: ProviderSettingsCoordinator,
    getSettings: () => ({}),
    getVaultPath: () => '/vault',
    persistence,
    onConversationDeleted: jest.fn().mockResolvedValue(undefined),
  });
  repository.replaceAll([conversation]);
  return { repository, persistence };
}

afterEach(() => jest.restoreAllMocks());

test('reopens every archived turn when native history cannot be read', async () => {
  const { repository } = createRepository({
    hydrateConversationHistory: jest.fn().mockRejectedValue(new Error('native session file is gone')),
  });

  const reopened = await repository.ensureHydrated('conv-1');

  expect(reopened?.messages.map(message => message.content)).toEqual([
    'first question', 'first answer', 'second question',
  ]);
  expect(reopened?.restoredFromArchive).toBe(true);
});

test('reopens every archived turn when native history comes back empty', async () => {
  const { repository } = createRepository({
    hydrateConversationHistory: jest.fn().mockResolvedValue({ messages: [] }),
  });

  const reopened = await repository.ensureHydrated('conv-1');

  expect(reopened?.messages).toHaveLength(3);
  expect(reopened?.restoredFromArchive).toBe(true);
});

test('prefers readable native history over the archive', async () => {
  const native: ChatMessage[] = [{ id: 'native', role: 'assistant', content: 'from CLI', timestamp: 9 }];
  const { repository, persistence } = createRepository({
    hydrateConversationHistory: jest.fn().mockResolvedValue({ messages: native }),
  });

  const reopened = await repository.ensureHydrated('conv-1');

  expect(reopened?.messages).toEqual(native);
  expect(reopened?.restoredFromArchive).toBe(false);
  expect(persistence.transcripts.load).not.toHaveBeenCalled();
});

test('archives the transcript whenever messages are saved', async () => {
  const { repository, persistence } = createRepository({
    hydrateConversationHistory: jest.fn().mockResolvedValue({ messages: [] }),
  });
  const messages = archived();

  await repository.update('conv-1', { messages });

  expect(persistence.transcripts.save).toHaveBeenCalledWith('conv-1', messages);
});
