import { homedir } from 'node:os';
import * as path from 'node:path';

import type { SessionMetadata } from '../../core/types';
import { migrateLegacyDshModelId } from '../settings/migrateLegacyDshProvider';

const LEGACY_PROVIDER_ID = 'dsh';
const PROVIDER_ID = 'deepseek';

/** The fork's early `dsh` provider became upstream's `deepseek` provider. */
function legacyDshHome(): string {
  const configured = process.env.DSH_HOME?.trim();
  return configured && path.isAbsolute(configured) ? configured : path.join(homedir(), '.dsh');
}

/**
 * DeepSeek's state binding is required before native history can be read. The
 * legacy provider stored no such binding, so a migrated conversation adopts the
 * default native store and the stock chat preset. Unknown legacy state is not
 * carried across: DeepSeek would reject it as a different store.
 */
function migrateProviderState(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.schemaVersion === 1 && typeof record.home === 'string') return value as Record<string, unknown>;
  }
  return {
    schemaVersion: 1,
    home: legacyDshHome(),
    profile: 'web',
    preset: 'claudian',
  };
}

export interface LegacyDshConversationMigration {
  metadata: SessionMetadata;
  changed: boolean;
}

/**
 * Rewrites a persisted conversation so the upstream DeepSeek provider can own
 * it. The native session id is kept: it names the same `dsh` session file.
 */
export function migrateLegacyDshConversation(metadata: SessionMetadata): LegacyDshConversationMigration {
  if (metadata.providerId !== LEGACY_PROVIDER_ID) return { metadata, changed: false };
  const migrated: SessionMetadata = {
    ...metadata,
    providerId: PROVIDER_ID,
    providerState: migrateProviderState(metadata.providerState),
    ...(metadata.selectedModel !== undefined
      ? { selectedModel: migrateLegacyDshModelId(metadata.selectedModel) as string }
      : {}),
    ...(metadata.modelRecoverySource
      ? {
          modelRecoverySource: {
            ...metadata.modelRecoverySource,
            providerState: migrateProviderState(metadata.modelRecoverySource.providerState),
          },
        }
      : {}),
  };
  return { metadata: migrated, changed: true };
}
