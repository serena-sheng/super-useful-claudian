import { ConversationTranscriptStore } from '@/app/storage/ConversationTranscriptStore';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { ChatMessage } from '@/core/types';

class MemoryAdapter {
  readonly files = new Map<string, string>();
  writes = 0;

  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error('missing');
    return value;
  }
  async write(path: string, content: string): Promise<void> {
    this.writes += 1;
    this.files.set(path, content);
  }
  async delete(path: string): Promise<void> { this.files.delete(path); }
}

function createStore() {
  const adapter = new MemoryAdapter();
  const store = new ConversationTranscriptStore(adapter as unknown as VaultFileAdapter, 'device-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  return { adapter, store };
}

const message = (id: string, content: string): ChatMessage => ({
  id, role: 'assistant', content, timestamp: 1,
});

test('round-trips every message into the device session folder', async () => {
  const { adapter, store } = createStore();
  await store.save('conv-1', [message('a', 'first'), message('b', 'second')]);

  expect(adapter.files.has('.super-useful-claudian/sessions/devices/device-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/conv-1.transcript.json')).toBe(true);
  await expect(store.load('conv-1')).resolves.toEqual([message('a', 'first'), message('b', 'second')]);
});

test('does not rewrite an unchanged transcript', async () => {
  const { adapter, store } = createStore();
  await store.save('conv-1', [message('a', 'first')]);
  await store.save('conv-1', [message('a', 'first')]);
  expect(adapter.writes).toBe(1);
});

test('returns null for a corrupt archive instead of blocking the conversation', async () => {
  const { adapter, store } = createStore();
  await adapter.write('.super-useful-claudian/sessions/devices/device-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/conv-1.transcript.json', '{not json');
  await expect(store.load('conv-1')).resolves.toBeNull();
});

test('drops entries that are not chat messages and refuses empty saves', async () => {
  const { adapter, store } = createStore();
  await adapter.write('.super-useful-claudian/sessions/devices/device-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/conv-1.transcript.json', JSON.stringify({
    version: 1, conversationId: 'conv-1', updatedAt: 1,
    messages: [message('a', 'kept'), { id: 'bad' }],
  }));
  await expect(store.load('conv-1')).resolves.toEqual([message('a', 'kept')]);

  await store.save('conv-1', []);
  expect(adapter.files.get('.super-useful-claudian/sessions/devices/device-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/conv-1.transcript.json'))
    .toContain('kept');
});

test('deletes the archive with the conversation', async () => {
  const { adapter, store } = createStore();
  await store.save('conv-1', [message('a', 'first')]);
  await store.delete('conv-1');
  expect(adapter.files.size).toBe(0);
  await expect(store.load('conv-1')).resolves.toBeNull();
});
