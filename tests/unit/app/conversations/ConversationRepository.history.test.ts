import '@/providers';

import { ConversationRepository } from '@/app/conversations/ConversationRepository';
import type { ConversationPersistence } from '@/app/storage/ConversationPersistenceStore';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { ProviderConversationHistoryService } from '@/core/providers/types';
import type { ChatMessage, Conversation } from '@/core/types';

function createConversation(id = 'conversation-1'): Conversation {
  return {
    id,
    providerId: 'omp',
    title: 'Conversation',
    createdAt: 1,
    lastActivityAt: 1,
    sessionId: 'session-1',
    messages: [],
  };
}

function createHistoryService(
  overrides: Partial<ProviderConversationHistoryService> = {},
): ProviderConversationHistoryService {
  return {
    buildForkProviderState: () => ({}),
    hydrateConversationHistory: async () => ({}),
    isPendingForkConversation: () => false,
    resolveSessionIdForConversation: value => value?.sessionId ?? null,
    ...overrides,
  } as ProviderConversationHistoryService;
}

function createRepository(conversation = createConversation()) {
  const persistence: jest.Mocked<ConversationPersistence> = {
    metadataReader: {
      revalidate: jest.fn().mockResolvedValue([]),
      load: jest.fn().mockResolvedValue(null),
      scan: jest.fn().mockResolvedValue({
        records: [],
        complete: true,
        invalidMetadataCount: 0,
      }),
      loadMetadata: jest.fn().mockResolvedValue(null),
      scanMetadata: jest.fn().mockResolvedValue({
        metadata: [],
        complete: true,
        invalidMetadataCount: 0,
      }),
      listMetadata: jest.fn().mockResolvedValue([]),
    },
    transcripts: {
      save: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    saveMetadata: jest.fn().mockResolvedValue(undefined),
    deleteCurrentMetadata: jest.fn().mockResolvedValue(undefined),
    assignMetadataToDevice: jest.fn().mockResolvedValue(undefined),
  };
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

test('releases cached history behind pending writes, preserves overlays, and reloads native history', async () => {
  const conversation = createConversation();
  conversation.messages = [{ id: 'local', role: 'assistant', content: 'Live client fragment', timestamp: 1 }];
  const projection = jest.fn((input: any, options?: { preserveProviderState?: boolean }) => (
    options?.preserveProviderState ? input.providerState : { overlay: input.messages.map((message: ChatMessage) => message.content) }
  ));
  const hydrate = jest.fn(async () => ({
    messages: [{ id: 'native', role: 'assistant' as const, content: 'Native history', timestamp: 2 }],
  }));
  const service = createHistoryService({
    buildPersistedProviderState: projection as never,
    hydrateConversationHistory: hydrate,
  });
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(service);
  const { repository, persistence } = createRepository(conversation);
  let release!: () => void;
  persistence.saveMetadata.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const saving = repository.rename(conversation.id, 'Saved title');
  while (!release) await Promise.resolve();
  let mayRelease = true;
  const evicting = repository.releaseHistory(conversation.id, () => mayRelease);
  mayRelease = false;
  release();
  await saving;
  await expect(evicting).resolves.toBe(false);
  expect(repository.getCachedConversation(conversation.id)?.messages[0].content).toBe('Live client fragment');
  mayRelease = true;
  await expect(repository.releaseHistory(conversation.id, () => mayRelease)).resolves.toBe(true);
  expect(repository.getCachedConversation(conversation.id)?.messages).toEqual([]);
  await repository.rename(conversation.id, 'After eviction');
  expect(persistence.saveMetadata.mock.calls.at(-1)?.[0].providerState).toEqual({ overlay: ['Live client fragment'] });
  expect(projection.mock.calls.at(-1)?.[1]).toMatchObject({ preserveProviderState: true });
  expect((await repository.getById(conversation.id))?.messages.map(message => message.content)).toEqual(['Native history']);
  expect(hydrate).toHaveBeenCalledTimes(1);
});

test('a superseded native history read cannot overwrite the current conversation', async () => {
  let started!: () => void;
  let release!: () => void;
  const reading = new Promise<void>(resolve => { started = resolve; });
  const deferred = new Promise<void>(resolve => { release = resolve; });
  const oldMessages: Conversation['messages'] = [
    { id: 'old-message', role: 'assistant', content: 'Old session response', timestamp: 1 },
  ];
  const newMessages: Conversation['messages'] = [
    { id: 'new-message', role: 'assistant', content: 'Current session response', timestamp: 2 },
  ];
  const service = createHistoryService({
    hydrateConversationHistory: async () => {
      started();
      await deferred;
      return { messages: oldMessages };
    },
  });
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(service);
  const conversation = createConversation();
  conversation.selectedModel = 'omp:anthropic/sonnet';
  const { repository } = createRepository(conversation);
  const pending = repository.ensureHydrated(conversation.id);
  await reading;
  await repository.update(conversation.id, { sessionId: 'session-2', messages: newMessages });
  release();
  expect(await pending).toBeNull();
  expect(repository.getCachedConversation(conversation.id)?.sessionId).toBe('session-2');
  expect(repository.getCachedConversation(conversation.id)?.messages).toEqual(newMessages);
});

test('does not publish recovered identity after concurrent deletion', async () => {
  const conversation = createConversation();
  const { repository, persistence } = createRepository(conversation);
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(createHistoryService({
    recoverConversationSessionReference: async () => {
      await repository.delete(conversation.id);
      return { sessionId: 'recovered-session' };
    },
  }));
  expect(await repository.ensureHydrated(conversation.id)).toBeNull();
  expect(repository.getCachedConversation(conversation.id)).toBeNull();
  expect(persistence.saveMetadata).not.toHaveBeenCalled();
});

test('keeps relocated native history readable after its metadata save fails', async () => {
  const conversation = createConversation();
  conversation.selectedModel = 'omp:anthropic/sonnet';
  const messages: Conversation['messages'] = [
    { id: 'native-response', role: 'assistant', content: 'Native history', timestamp: 2 },
  ];
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(createHistoryService({
    hydrateConversationHistory: async () => ({ messages }),
  }));
  const { repository, persistence } = createRepository(conversation);
  persistence.saveMetadata.mockRejectedValue(new Error('Metadata unavailable'));

  expect((await repository.ensureHydrated(conversation.id))?.messages).toEqual(messages);
  expect(repository.getCachedConversation(conversation.id)?.sessionId).toBe('session-1');
});

test('restores the conversation when missing-session metadata removal fails', async () => {
  const conversation = createConversation();
  const { repository, persistence } = createRepository(conversation);
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(createHistoryService({
    resolveMissingConversationSession: async () => ({ outcome: 'delete' }),
  }));
  persistence.deleteCurrentMetadata.mockRejectedValue(new Error('Metadata cleanup failed'));

  await expect(repository.handleMissingProviderSession(conversation.id, 'session-1'))
    .rejects.toThrow('Metadata cleanup failed');
  expect(repository.getCachedConversation(conversation.id)).toMatchObject({ id: conversation.id });
});

test('surfaces a failed missing-session reset save while preserving live identity', async () => {
  const conversation = createConversation();
  const { repository, persistence } = createRepository(conversation);
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(createHistoryService({
    resolveMissingConversationSession: async () => ({ outcome: 'reset' }),
  }));
  persistence.saveMetadata.mockRejectedValue(new Error('Metadata save failed'));

  await expect(repository.handleMissingProviderSession(conversation.id, 'session-1'))
    .rejects.toThrow('Metadata save failed');
  expect(repository.getCachedConversation(conversation.id)?.sessionId).toBe('session-1');
});

test('late accepted binding survives a missing-session decision', async () => {
  const conversation = createConversation();
  const { repository } = createRepository(conversation);
  let updating: Promise<void> | undefined;
  jest.spyOn(ProviderRegistry, 'getConversationHistoryService').mockReturnValue(createHistoryService({
    resolveMissingConversationSession: async () => {
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => {
        updating = repository.update(conversation.id, { sessionId: 'new-session' });
      })));
      return { outcome: 'delete' };
    },
  }));
  const outcome = await repository.handleMissingProviderSession(conversation.id, 'session-1');
  await updating;
  expect(outcome).toBe('preserved');
  expect(repository.getCachedConversation(conversation.id)?.sessionId).toBe('new-session');
});
