import { migrateLegacyDshConversation } from '@/app/conversations/migrateLegacyDshConversation';
import type { SessionMetadata } from '@/core/types';

function metadata(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: 'conv-1',
    providerId: 'dsh',
    title: 'Old session',
    createdAt: 1,
    lastActivityAt: 2,
    sessionId: 'session-file',
    selectedModel: 'dsh:["deepseek-account","deepseek-flash"]',
    providerState: { nativeConversationContextEstablished: true },
    ...overrides,
  };
}

test('moves a legacy dsh conversation onto the deepseek provider', () => {
  const { metadata: migrated, changed } = migrateLegacyDshConversation(metadata());

  expect(changed).toBe(true);
  expect(migrated.providerId).toBe('deepseek');
  expect(migrated.sessionId).toBe('session-file');
  expect(migrated.selectedModel).toBe('deepseek:deepseek-account/deepseek-flash');
  expect(migrated.providerState).toMatchObject({
    schemaVersion: 1, profile: 'web', preset: 'claudian',
  });
  expect(typeof (migrated.providerState as Record<string, unknown>).home).toBe('string');
});

test('leaves a current deepseek conversation untouched', () => {
  const current = metadata({
    providerId: 'deepseek',
    providerState: { schemaVersion: 1, home: '/home/.dsh', profile: 'web', preset: 'claudian' },
  });
  const result = migrateLegacyDshConversation(current);
  expect(result.changed).toBe(false);
  expect(result.metadata).toBe(current);
});
