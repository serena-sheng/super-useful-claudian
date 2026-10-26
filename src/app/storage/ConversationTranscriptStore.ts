import { getDeviceSessionsPath, isValidSessionMetadataId } from '@/core/bootstrap/storagePaths';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { ChatMessage } from '@/core/types';

const TRANSCRIPT_SUFFIX = '.transcript.json';
const TRANSCRIPT_VERSION = 1;
/** A single archive stays readable while never becoming an unbounded write on every turn. */
const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024;
const TRUNCATED_TOOL_CONTENT = 32_000;
const TRUNCATION_MARKER = '\n\n[Truncated in the local recovery archive]';

interface StoredTranscript {
  version: 1;
  conversationId: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface ConversationTranscriptPersistence {
  save(conversationId: string, messages: readonly ChatMessage[]): Promise<void>;
  load(conversationId: string): Promise<ChatMessage[] | null>;
  delete(conversationId: string): Promise<void>;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === 'string'
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && typeof message.timestamp === 'number';
}

/**
 * Local, provider-independent conversation archive.
 *
 * Native provider history stays authoritative whenever it is readable. This
 * sidecar exists so a session can still be reopened with every turn visible
 * after its CLI store was deleted, rotated, or moved to another machine.
 */
export class ConversationTranscriptStore implements ConversationTranscriptPersistence {
  private readonly deviceSessionsPath: string;
  /** Last payload written per conversation, so progress saves do not rewrite unchanged text. */
  private readonly lastWritten = new Map<string, string>();

  constructor(private readonly adapter: VaultFileAdapter, deviceKey: string) {
    this.deviceSessionsPath = getDeviceSessionsPath(deviceKey);
  }

  getPath(conversationId: string): string {
    return `${this.deviceSessionsPath}/${conversationId}${TRANSCRIPT_SUFFIX}`;
  }

  async save(conversationId: string, messages: readonly ChatMessage[]): Promise<void> {
    if (!isValidSessionMetadataId(conversationId) || messages.length === 0) return;
    const serialized = this.serialize(conversationId, messages);
    if (this.lastWritten.get(conversationId) === serialized) return;
    await this.adapter.write(this.getPath(conversationId), serialized);
    this.lastWritten.set(conversationId, serialized);
  }

  async load(conversationId: string): Promise<ChatMessage[] | null> {
    if (!isValidSessionMetadataId(conversationId)) return null;
    try {
      const path = this.getPath(conversationId);
      if (!await this.adapter.exists(path)) return null;
      const parsed: unknown = JSON.parse(await this.adapter.read(path));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const record = parsed as Partial<StoredTranscript>;
      if (record.version !== TRANSCRIPT_VERSION || !Array.isArray(record.messages)) return null;
      const messages = record.messages.filter(isChatMessage);
      return messages.length > 0 ? messages : null;
    } catch {
      // A corrupt archive must not block the conversation from opening.
      return null;
    }
  }

  async delete(conversationId: string): Promise<void> {
    this.lastWritten.delete(conversationId);
    if (!isValidSessionMetadataId(conversationId)) return;
    const path = this.getPath(conversationId);
    try {
      if (await this.adapter.exists(path)) await this.adapter.delete(path);
    } catch {
      // Best-effort cleanup; the orphaned archive is harmless and overwritten on reuse.
    }
  }

  private serialize(conversationId: string, messages: readonly ChatMessage[]): string {
    const payload: StoredTranscript = {
      version: TRANSCRIPT_VERSION,
      conversationId,
      updatedAt: Date.now(),
      messages: [...messages],
    };
    let text = JSON.stringify(payload);
    if (text.length <= MAX_ARCHIVE_BYTES) return text;

    // Oversized archives keep every turn and every tool status, but cap the
    // bulkiest payloads so one long shell session cannot balloon the vault.
    payload.messages = messages.map(message => this.compactMessage(message));
    text = JSON.stringify(payload);
    return text.length <= MAX_ARCHIVE_BYTES ? text : this.dropOversizedAttachments(payload, text);
  }

  private compactMessage(message: ChatMessage): ChatMessage {
    if (!message.toolCalls?.length) return message;
    return {
      ...message,
      toolCalls: message.toolCalls.map(tool => (
        tool.result && tool.result.length > TRUNCATED_TOOL_CONTENT
          ? { ...tool, result: `${tool.result.slice(0, TRUNCATED_TOOL_CONTENT)}${TRUNCATION_MARKER}` }
          : tool
      )),
    };
  }

  private dropOversizedAttachments(payload: StoredTranscript, text: string): string {
    if (text.length <= MAX_ARCHIVE_BYTES) return text;
    payload.messages = payload.messages.map(message => (
      message.images?.length
        ? { ...message, images: message.images.map(image => ({ ...image, data: '' })) }
        : message
    ));
    return JSON.stringify(payload);
  }
}
