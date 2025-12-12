/**
 * Claudian - Utility functions
 *
 * Helper functions for vault operations, date formatting, and environment parsing.
 */

import type { App } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** Returns today's date in readable and ISO format for the system prompt. */
export function getTodayDate(): string {
  const now = new Date();
  const readable = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const iso = now.toISOString().split('T')[0];
  return `${readable} (${iso})`;
}

/** Returns the vault's absolute file path, or null if unavailable. */
export function getVaultPath(app: App): string | null {
  const adapter = app.vault.adapter;
  if ('basePath' in adapter) {
    return (adapter as any).basePath;
  }
  return null;
}

/** Finds Claude Code CLI executable in common install locations. */
export function findClaudeCLIPath(): string | null {
  const homeDir = os.homedir();
  const commonPaths = [
    path.join(homeDir, '.claude', 'local', 'claude'),
    path.join(homeDir, '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(homeDir, 'bin', 'claude'),
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/** Best-effort realpath that falls back to path.resolve for non-existent targets. */
function resolveRealPath(p: string): string {
  try {
    return (fs.realpathSync.native ?? fs.realpathSync)(p);
  } catch {
    return path.resolve(p);
  }
}

/** Checks whether a candidate path is within the vault. */
export function isPathWithinVault(candidatePath: string, vaultPath: string): boolean {
  const vaultReal = resolveRealPath(vaultPath);

  const expandedPath = candidatePath.startsWith('~/')
    ? path.join(os.homedir(), candidatePath.slice(2))
    : candidatePath;

  const absCandidate = path.isAbsolute(expandedPath)
    ? expandedPath
    : path.resolve(vaultPath, expandedPath);

  const resolvedCandidate = resolveRealPath(absCandidate);

  return resolvedCandidate === vaultReal || resolvedCandidate.startsWith(vaultReal + path.sep);
}

/** Parses KEY=VALUE environment variables from text. Supports comments (#) and empty lines. */
export function parseEnvironmentVariables(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (key) {
        result[key] = value;
      }
    }
  }
  return result;
}

/** Extracts model options from ANTHROPIC_* environment variables, deduplicated by value. */
export function getModelsFromEnvironment(envVars: Record<string, string>): { value: string; label: string; description: string }[] {
  const modelMap = new Map<string, { types: string[]; label: string }>();

  const modelEnvEntries: { type: string; envKey: string }[] = [
    { type: 'model', envKey: 'ANTHROPIC_MODEL' },
    { type: 'opus', envKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL' },
    { type: 'sonnet', envKey: 'ANTHROPIC_DEFAULT_SONNET_MODEL' },
    { type: 'haiku', envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL' },
  ];

  for (const { type, envKey } of modelEnvEntries) {
    const modelValue = envVars[envKey];
    if (modelValue) {
      const label = modelValue.includes('/')
        ? modelValue.split('/').pop() || modelValue
        : modelValue.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      if (!modelMap.has(modelValue)) {
        modelMap.set(modelValue, { types: [type], label });
      } else {
        modelMap.get(modelValue)!.types.push(type);
      }
    }
  }

  const models: { value: string; label: string; description: string }[] = [];
  const typePriority = { 'model': 4, 'opus': 3, 'sonnet': 2, 'haiku': 1 };

  const sortedEntries = Array.from(modelMap.entries()).sort(([, aInfo], [, bInfo]) => {
    const aPriority = Math.max(...aInfo.types.map(t => typePriority[t as keyof typeof typePriority] || 0));
    const bPriority = Math.max(...bInfo.types.map(t => typePriority[t as keyof typeof typePriority] || 0));
    return bPriority - aPriority;
  });

  for (const [modelValue, info] of sortedEntries) {
    const sortedTypes = info.types.sort((a, b) =>
      (typePriority[b as keyof typeof typePriority] || 0) -
      (typePriority[a as keyof typeof typePriority] || 0)
    );

    models.push({
      value: modelValue,
      label: info.label,
      description: `Custom model (${sortedTypes.join(', ')})`
    });
  }

  return models;
}

/** Returns the highest-priority custom model from environment variables, or null. */
export function getCurrentModelFromEnvironment(envVars: Record<string, string>): string | null {
  if (envVars.ANTHROPIC_MODEL) {
    return envVars.ANTHROPIC_MODEL;
  }
  if (envVars.ANTHROPIC_DEFAULT_OPUS_MODEL) {
    return envVars.ANTHROPIC_DEFAULT_OPUS_MODEL;
  }
  if (envVars.ANTHROPIC_DEFAULT_SONNET_MODEL) {
    return envVars.ANTHROPIC_DEFAULT_SONNET_MODEL;
  }
  if (envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
    return envVars.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  }
  return null;
}
