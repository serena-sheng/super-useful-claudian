import { getInstallationKey } from '@/core/device/InstallationKey';

import type { ProviderSelectionInputs } from '../../core/providers/ProviderRuntimeHost';
import { normalizeHostnameStringMap } from '../../core/providers/settings/HostnameStringMap';
import {
  readStoredBoolean,
  readStoredString,
} from '../../core/providers/settings/storedSettings';
import type { HostnameCLIPaths } from '../../core/types/settings';
import {
  clampOmpThinkingLevel,
  decodeOmpModelId,
  findOmpModel,
  normalizeOmpDiscoveredModels,
  normalizeOmpThinkingLevel,
  type OmpDiscoveredModel,
  type OmpThinkingLevel
} from './models';

export interface PersistedOmpProviderSettings {
  cliPath: string;
  cliPathsByHost: HostnameCLIPaths;
  discoveredModels: OmpDiscoveredModel[];
  enabled: boolean;
  environmentHash: string;
  sessionEnvironmentHash: string;
  environmentVariables: string;
  modelAliases: Record<string, string>;
  preferredThinkingByModel: Record<string, OmpThinkingLevel>;
  visibleModels: string[];
}

export type OmpProviderSettings = PersistedOmpProviderSettings;

export const DEFAULT_OMP_PROVIDER_SETTINGS: Readonly<PersistedOmpProviderSettings> = Object.freeze({
  cliPath: '',
  cliPathsByHost: {},
  discoveredModels: [],
  enabled: false,
  environmentHash: '',
  sessionEnvironmentHash: '',
  environmentVariables: '',
  modelAliases: {},
  preferredThinkingByModel: {},
  visibleModels: [],
});

export function normalizeOmpVisibleModels(
  value: unknown,
  discoveredModels: OmpDiscoveredModel[] = [],
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || !decodeOmpModelId(trimmed)) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Decodes this provider's own configuration plus the current selection inputs.
 * Runtime code receives both from `ProviderRuntimeHost`; nothing here reads the
 * application settings document.
 */
export function decodeOmpConfig(
  config: Readonly<Record<string, unknown>>,
  selection: Pick<ProviderSelectionInputs, 'referencedModelIds'>,
): OmpProviderSettings {
  const cliPathsByHost = normalizeHostnameStringMap(config.cliPathsByHost);
  const discoveredModels = normalizeOmpDiscoveredModels(config.discoveredModels ?? config.selectedModels);
  const visibleModels = normalizeOmpVisibleModels(config.visibleModels, discoveredModels);
  const persistableIds = getPersistableOmpModelIds(selection, visibleModels);

  return {
    cliPath: readStoredString(config.cliPath, DEFAULT_OMP_PROVIDER_SETTINGS.cliPath),
    cliPathsByHost,
    discoveredModels,
    enabled: readStoredBoolean(config.enabled, DEFAULT_OMP_PROVIDER_SETTINGS.enabled),
    environmentHash: readStoredString(
      config.environmentHash,
      DEFAULT_OMP_PROVIDER_SETTINGS.environmentHash,
    ),
    sessionEnvironmentHash: readStoredString(
      config.sessionEnvironmentHash,
      DEFAULT_OMP_PROVIDER_SETTINGS.sessionEnvironmentHash,
    ),
    environmentVariables: readStoredString(
      config.environmentVariables,
      DEFAULT_OMP_PROVIDER_SETTINGS.environmentVariables,
    ),
    modelAliases: normalizeOmpModelAliasesForPersistableIds(
      config.modelAliases,
      discoveredModels,
      persistableIds,
    ),
    preferredThinkingByModel: normalizeOmpPreferredThinkingForPersistableIds(
      config.preferredThinkingByModel,
      discoveredModels,
      persistableIds,
    ),
    visibleModels,
  };
}

/** Applies a patch in place to the provider's own configuration record. */
export function updateOmpConfig(
  settings: Record<string, unknown>,
  selection: Pick<ProviderSelectionInputs, 'referencedModelIds'>,
  updates: Partial<OmpProviderSettings>,
): OmpProviderSettings {
  const current = decodeOmpConfig(settings, selection);
  const hostnameKey = getInstallationKey();
  const nextDiscoveredModels = normalizeOmpDiscoveredModels(
    updates.discoveredModels ?? current.discoveredModels,
  );
  const nextVisibleModels = normalizeOmpVisibleModels(
    updates.visibleModels ?? current.visibleModels,
    nextDiscoveredModels,
  );
  const persistableIds = getPersistableOmpModelIds(selection, nextVisibleModels);
  const nextModelAliases = pruneMapToPersistableIds(
    normalizeOmpModelAliasesForPersistableIds(
      updates.modelAliases ?? current.modelAliases,
      nextDiscoveredModels,
      persistableIds,
    ),
    persistableIds,
  );
  const nextPreferredThinkingByModel = pruneMapToPersistableIds(
    normalizeOmpPreferredThinkingForPersistableIds(
      updates.preferredThinkingByModel ?? current.preferredThinkingByModel,
      nextDiscoveredModels,
      persistableIds,
    ),
    persistableIds,
  );
  const nextCliPathsByHost = 'cliPathsByHost' in updates
    ? normalizeHostnameStringMap(updates.cliPathsByHost)
    : { ...current.cliPathsByHost };
  let nextCliPath = 'cliPathsByHost' in updates
    ? (
      typeof updates.cliPath === 'string'
        ? updates.cliPath.trim()
        : DEFAULT_OMP_PROVIDER_SETTINGS.cliPath
    )
    : current.cliPath.trim();

  if ('cliPath' in updates && !('cliPathsByHost' in updates)) {
    const trimmedCliPath = typeof updates.cliPath === 'string' ? updates.cliPath.trim() : '';
    if (trimmedCliPath) {
      nextCliPathsByHost[hostnameKey] = trimmedCliPath;
    } else {
      delete nextCliPathsByHost[hostnameKey];
    }
    nextCliPath = DEFAULT_OMP_PROVIDER_SETTINGS.cliPath;
  }

  const next: OmpProviderSettings = {
    ...current,
    ...updates,
    cliPath: nextCliPath,
    cliPathsByHost: nextCliPathsByHost,
    discoveredModels: nextDiscoveredModels,
    modelAliases: nextModelAliases,
    preferredThinkingByModel: nextPreferredThinkingByModel,
    visibleModels: nextVisibleModels,
  };

  if (updates.visibleModels !== undefined) {
    const retargetedPersistableIds = getPersistableOmpModelIds(selection, next.visibleModels);
    next.modelAliases = pruneMapToPersistableIds(next.modelAliases, retargetedPersistableIds);
    next.preferredThinkingByModel = pruneMapToPersistableIds(
      next.preferredThinkingByModel,
      retargetedPersistableIds,
    );
  }

  Object.assign(settings, {
    cliPath: next.cliPath,
    cliPathsByHost: next.cliPathsByHost,
    discoveredModels: next.discoveredModels,
    enabled: next.enabled,
    environmentHash: next.environmentHash,
    sessionEnvironmentHash: next.sessionEnvironmentHash,
    environmentVariables: next.environmentVariables,
    modelAliases: next.modelAliases,
    preferredThinkingByModel: next.preferredThinkingByModel,
    visibleModels: next.visibleModels,
  });

  return next;
}

function normalizeOmpModelAliasesForPersistableIds(
  value: unknown,
  discoveredModels: OmpDiscoveredModel[],
  persistableIds: Set<string>,
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [encodedId, alias] of Object.entries(value as Record<string, unknown>)) {
    if (typeof alias !== 'string') {
      continue;
    }

    const normalizedEncodedId = normalizeOmpPersistableEncodedId(
      encodedId,
      discoveredModels,
      persistableIds,
    );
    const normalizedAlias = alias.trim();
    if (!normalizedEncodedId || !normalizedAlias) {
      continue;
    }

    normalized[normalizedEncodedId] = normalizedAlias;
  }

  return normalized;
}

function normalizeOmpPreferredThinkingForPersistableIds(
  value: unknown,
  discoveredModels: OmpDiscoveredModel[],
  persistableIds: Set<string>,
): Record<string, OmpThinkingLevel> {
  return normalizeOmpPreferredThinkingEntries(
    value,
    discoveredModels,
    encodedId => normalizeOmpPersistableEncodedId(
      encodedId,
      discoveredModels,
      persistableIds,
    ),
  );
}

function normalizeOmpPreferredThinkingEntries(
  value: unknown,
  discoveredModels: OmpDiscoveredModel[],
  normalizeEncodedId: (encodedId: string) => string,
): Record<string, OmpThinkingLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, OmpThinkingLevel> = {};
  for (const [encodedId, thinkingLevel] of Object.entries(value as Record<string, unknown>)) {
    const normalizedEncodedId = normalizeEncodedId(encodedId);
    const normalizedThinkingLevel = normalizeOmpThinkingLevel(thinkingLevel);
    if (!normalizedEncodedId || !normalizedThinkingLevel) {
      continue;
    }

    const discoveredModel = discoveredModels.find(model => model.encodedId === normalizedEncodedId);
    normalized[normalizedEncodedId] = discoveredModel
      ? clampOmpThinkingLevel(normalizedThinkingLevel, discoveredModel.thinkingLevels)
      : normalizedThinkingLevel;
  }

  return normalized;
}

function normalizeOmpPersistableEncodedId(
  value: string,
  discoveredModels: OmpDiscoveredModel[],
  persistableIds: Set<string>,
): string {
  const trimmed = value.trim();
  const decoded = decodeOmpModelId(trimmed);
  if (!decoded) {
    return '';
  }

  const discoveredModel = findOmpModel({ discoveredModels }, trimmed);
  if (discoveredModel) {
    return discoveredModel.encodedId;
  }

  return persistableIds.has(trimmed) ? trimmed : '';
}

function getPersistableOmpModelIds(
  selection: Pick<ProviderSelectionInputs, 'referencedModelIds'>,
  visibleModels: string[],
): Set<string> {
  const persistableIds = new Set(visibleModels);
  for (const id of selection.referencedModelIds) addPersistableSelection(persistableIds, id);
  return persistableIds;
}

function addPersistableSelection(target: Set<string>, value: unknown): void {
  if (typeof value === 'string' && decodeOmpModelId(value)) {
    target.add(value);
  }
}

function pruneMapToPersistableIds<T extends string>(
  value: Record<string, T>,
  persistableIds: Set<string>,
): Record<string, T> {
  const pruned: Record<string, T> = {};
  for (const [encodedId, entry] of Object.entries(value)) {
    if (persistableIds.has(encodedId)) {
      pruned[encodedId] = entry;
    }
  }
  return pruned;
}
