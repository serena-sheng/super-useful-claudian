/**
 * Claudian - Personal pack
 *
 * A vault folder can carry the parts of an assistant setup that belong to the
 * user rather than the plugin: identity text today, and any provider-native
 * files (commands, skills, MCP config) the CLIs already know how to load.
 * The plugin only reads `identity.md`; everything under it stays in the vault.
 */

import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';

/** Vault-relative folder that holds the personal pack. */
export const PERSONAL_PACK_ROOT = '.super-useful-claudian/personal';
/** Identity text appended to every chat's system prompt. */
export const PERSONAL_PACK_IDENTITY_PATH = `${PERSONAL_PACK_ROOT}/identity.md`;

/** The read surface the pack needs, so tests can supply an in-memory vault. */
export interface PersonalPackReader {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
}

/** Owns the loaded personal-pack identity text and reloads it when its file changes. */
export class PersonalPackService {
  private identity = '';
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly reader: PersonalPackReader) {}

  static fromVaultAdapter(adapter: VaultFileAdapter): PersonalPackReader {
    return {
      exists: path => adapter.exists(path),
      read: path => adapter.read(path),
    };
  }

  get identityPath(): string {
    return PERSONAL_PACK_IDENTITY_PATH;
  }

  /** The identity text current for the next prompt; empty when no pack is installed. */
  getIdentityInstructions(): string {
    return this.identity;
  }

  /** True for the one pack path that changes prompt content. */
  isIdentityPath(path: string): boolean {
    return path === PERSONAL_PACK_IDENTITY_PATH;
  }

  /** Serialized reloads keep a slow read from overwriting a newer one. */
  load(): Promise<void> {
    this.tail = this.tail.then(() => this.#readIdentity());
    return this.tail;
  }

  async #readIdentity(): Promise<void> {
    try {
      if (!await this.reader.exists(PERSONAL_PACK_IDENTITY_PATH)) {
        this.identity = '';
        return;
      }
      this.identity = (await this.reader.read(PERSONAL_PACK_IDENTITY_PATH)).trim();
    } catch {
      // A missing or unreadable pack is the documented "not installed" state.
      this.identity = '';
    }
  }
}
