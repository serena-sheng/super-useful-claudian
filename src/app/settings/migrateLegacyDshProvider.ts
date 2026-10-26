/**
 * One-way migration from the fork's early `dsh` provider to upstream Claudian's
 * `deepseek` provider, which superseded it. Both address the same DeepSeek
 * Harness CLI and native store; only the provider id and model-id encoding differ.
 *
 * Settings are plain documents here, so this migration deliberately duplicates
 * the two encodings instead of importing a concrete provider module.
 */
const LEGACY_PROVIDER_ID = 'dsh';
const PROVIDER_ID = 'deepseek';
const LEGACY_MODEL_PREFIX = 'dsh:';
const MODEL_PREFIX = 'deepseek:';

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** `dsh:["route","model"]` → `deepseek:route%2Fmodel`; unrelated ids are returned unchanged. */
export function migrateLegacyDshModelId(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith(LEGACY_MODEL_PREFIX)) return value;
  const raw = value.slice(LEGACY_MODEL_PREFIX.length);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 2) return value;
    const [route, model] = parsed as unknown[];
    if (typeof route !== 'string' || !route.trim() || typeof model !== 'string' || !model.trim()) return value;
    return `${MODEL_PREFIX}${encodeURIComponent(route.trim())}/${encodeURIComponent(model.trim())}`;
  } catch {
    return value;
  }
}

function migrateModelMap(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const migrated: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    migrated[String(migrateLegacyDshModelId(key))] = entry;
  }
  return migrated;
}

/** Renames the provider key while preserving the stored value verbatim. */
function renameProviderKey(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record[LEGACY_PROVIDER_ID] !== undefined && record[PROVIDER_ID] === undefined) {
    record[PROVIDER_ID] = record[LEGACY_PROVIDER_ID];
  }
  delete record[LEGACY_PROVIDER_ID];
  return record;
}

function decodeLegacyModels(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const catalogs = config.catalogsByHost;
  const models: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  if (catalogs && typeof catalogs === 'object' && !Array.isArray(catalogs)) {
    for (const snapshot of Object.values(catalogs as Record<string, unknown>)) {
      if (!snapshot || typeof snapshot !== 'object') continue;
      const rows = (snapshot as Record<string, unknown>).models;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const entry = row as Record<string, unknown>;
        const rawId = typeof entry.rawId === 'string' ? entry.rawId : '';
        const parsed: unknown = parseJson(rawId);
        if (!Array.isArray(parsed) || parsed.length !== 2) continue;
        const [provider, id] = parsed as unknown[];
        if (typeof provider !== 'string' || typeof id !== 'string') continue;
        const encodedId = `${MODEL_PREFIX}${encodeURIComponent(provider)}/${encodeURIComponent(id)}`;
        if (seen.has(encodedId)) continue;
        seen.add(encodedId);
        models.push({
          provider,
          id,
          label: typeof entry.displayName === 'string' ? entry.displayName : id,
          ...(Array.isArray(entry.reasoningEfforts) && entry.reasoningEfforts.length > 0
            ? { reasoning: entry.reasoningEfforts }
            : {}),
        });
      }
    }
  }
  return models;
}

function migrateProviderConfig(legacy: Record<string, unknown>): Record<string, unknown> {
  const models = decodeLegacyModels(legacy);
  const visibleModels = Array.isArray(legacy.visibleModels)
    ? legacy.visibleModels.map(migrateLegacyDshModelId).filter((id): id is string => typeof id === 'string')
    : [];
  return {
    enabled: legacy.enabled === true,
    codeMode: legacy.codeMode === true,
    presetPlugins: '',
    cliPath: typeof legacy.cliPath === 'string' ? legacy.cliPath : '',
    cliPathsByHost: legacy.cliPathsByHost && typeof legacy.cliPathsByHost === 'object'
      ? legacy.cliPathsByHost
      : {},
    environmentVariables: typeof legacy.environmentVariables === 'string' ? legacy.environmentVariables : '',
    environmentHash: '',
    discoveredModels: models,
    visibleModels,
    modelAliases: migrateModelMap(legacy.modelAliases) ?? {},
    preferredReasoningByModel: migrateModelMap(legacy.preferredReasoningByModel) ?? {},
  };
}

/**
 * Rewrites every settings surface that names the provider. Returns whether the
 * document changed so the caller can persist the migration once.
 */
export function migrateLegacyDshProviderSettings(settings: Record<string, unknown>): boolean {
  const before = JSON.stringify({
    providerConfigs: settings.providerConfigs,
    savedProviderModel: settings.savedProviderModel,
    savedProviderEffort: settings.savedProviderEffort,
    savedProviderServiceTier: settings.savedProviderServiceTier,
    savedProviderPermissionMode: settings.savedProviderPermissionMode,
    pendingProviderSessionInvalidations: settings.pendingProviderSessionInvalidations,
    settingsProvider: settings.settingsProvider,
    lastSelectedChatModel: settings.lastSelectedChatModel,
    inlineEditModel: settings.inlineEditModel,
  });

  const configs = settings.providerConfigs;
  if (configs && typeof configs === 'object' && !Array.isArray(configs)) {
    const record = configs as Record<string, unknown>;
    const legacy = record[LEGACY_PROVIDER_ID];
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
      if (record[PROVIDER_ID] === undefined) {
        record[PROVIDER_ID] = migrateProviderConfig(legacy as Record<string, unknown>);
      }
      delete record[LEGACY_PROVIDER_ID];
    }
  }

  settings.savedProviderModel = renameProviderKey(settings.savedProviderModel);
  // Model ids ride inside each provider map; migrate them after renaming the key.
  const savedModels = settings.savedProviderModel as Record<string, unknown> | undefined;
  if (savedModels && savedModels[PROVIDER_ID] !== undefined) {
    savedModels[PROVIDER_ID] = migrateLegacyDshModelId(savedModels[PROVIDER_ID]);
  }
  settings.savedProviderEffort = renameProviderKey(settings.savedProviderEffort);
  settings.savedProviderServiceTier = renameProviderKey(settings.savedProviderServiceTier);
  settings.savedProviderPermissionMode = renameProviderKey(settings.savedProviderPermissionMode);
  settings.pendingProviderSessionInvalidations = renameProviderKey(settings.pendingProviderSessionInvalidations);

  if (settings.settingsProvider === LEGACY_PROVIDER_ID) settings.settingsProvider = PROVIDER_ID;
  for (const field of ['lastSelectedChatModel', 'inlineEditModel'] as const) {
    const selection = settings[field];
    if (selection && typeof selection === 'object' && !Array.isArray(selection)) {
      const record = selection as Record<string, unknown>;
      if (record.providerId === LEGACY_PROVIDER_ID) record.providerId = PROVIDER_ID;
      if (record.model !== undefined) record.model = migrateLegacyDshModelId(record.model);
    }
  }
  if (settings.model !== undefined) settings.model = migrateLegacyDshModelId(settings.model);
  if (settings.titleGenerationModel !== undefined) {
    settings.titleGenerationModel = migrateLegacyDshModelId(settings.titleGenerationModel);
  }

  const after = JSON.stringify({
    providerConfigs: settings.providerConfigs,
    savedProviderModel: settings.savedProviderModel,
    savedProviderEffort: settings.savedProviderEffort,
    savedProviderServiceTier: settings.savedProviderServiceTier,
    savedProviderPermissionMode: settings.savedProviderPermissionMode,
    pendingProviderSessionInvalidations: settings.pendingProviderSessionInvalidations,
    settingsProvider: settings.settingsProvider,
    lastSelectedChatModel: settings.lastSelectedChatModel,
    inlineEditModel: settings.inlineEditModel,
  });
  return before !== after;
}
