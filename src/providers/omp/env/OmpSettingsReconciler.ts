import { getInstallationKey } from '@/core/device/InstallationKey';
import { parseEnvironmentVariables } from '@/core/process/env';

import {
  type CLIPathFingerprintInputs,
  createCLIPathFingerprintInputs,
  hasCLIPathFingerprintInputs,
} from '../../../core/providers/cli/CLIPathFingerprintInputs';
import { getRuntimeEnvironmentText } from '../../../core/providers/providerEnvironment';
import {
  compareScopedRuntimeInputFingerprints,
  createRuntimeInputFingerprint,
  isVersionedRuntimeInputFingerprint,
  type ScopedRuntimeInputFingerprints,
} from '../../../core/providers/settings/RuntimeInputFingerprint';
import type {
  ProviderEnvironmentReconciliation,
  ProviderSettingsReconciler,
} from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import {
  getOmpProviderSettings,
  updateOmpProviderSettings
} from '../settings';
import { clearOmpResumeState } from '../types';

/**
 * Select the native config/session store; `PI_PACKAGE_DIR` can rename the default config dir.
 * Changes invalidate bindings.
 */
const OMP_SESSION_ENV_KEYS = [
  'PI_CODING_AGENT_DIR',
  'PI_CODING_AGENT_SESSION_DIR',
  'PI_PACKAGE_DIR',
] as const;

const LEGACY_OMP_ENV_HASH_KEYS = [
  ...OMP_SESSION_ENV_KEYS,
  'PI_OFFLINE',
  'PI_SKIP_VERSION_CHECK',
  'PI_TELEMETRY',
  'PI_CACHE_RETENTION',
] as const;

/**
 * Non-session keys and CLI paths only affect the launched process. Resume targets an absolute
 * session file whose identity is proved before input, so changes restart runtimes and keep bindings.
 */
const OMP_ENV_HASH_KEYS = [
  ...LEGACY_OMP_ENV_HASH_KEYS,
  'PATH',
] as const;

function computeOmpFingerprints(
  environmentText: string,
  cliPathInputs: CLIPathFingerprintInputs,
): ScopedRuntimeInputFingerprints {
  return {
    runtime: createRuntimeInputFingerprint({
      additionalInputs: cliPathInputs,
      environmentKeys: OMP_ENV_HASH_KEYS,
      environmentText,
    }),
    session: computeOmpSessionFingerprint(environmentText),
  };
}

function computeOmpSessionFingerprint(environmentText: string): string {
  return createRuntimeInputFingerprint({ environmentKeys: OMP_SESSION_ENV_KEYS, environmentText });
}

function invalidateOmpConversationSessions(conversations: Conversation[]): Conversation[] {
  return conversations.filter(conversation => (
    conversation.providerId === 'omp' && clearOmpResumeState(conversation)
  ));
}

function isCurrentLegacyOmpFingerprint(
  environmentText: string,
  savedFingerprint: string,
  cliPathInputs: CLIPathFingerprintInputs,
): boolean {
  if (
    !savedFingerprint
    || isVersionedRuntimeInputFingerprint(savedFingerprint)
    || hasCLIPathFingerprintInputs(cliPathInputs)
  ) {
    return false;
  }

  const environment = parseEnvironmentVariables(environmentText);
  const legacyFingerprint = LEGACY_OMP_ENV_HASH_KEYS
    .filter(key => environment[key])
    .map(key => `${key}=${environment[key]}`)
    .sort()
    .join('|');
  return savedFingerprint === legacyFingerprint;
}

export const ompSettingsReconciler = {

  invalidateConversationSessions: invalidateOmpConversationSessions,

  reconcileModelWithEnvironment(settings: Record<string, unknown>): ProviderEnvironmentReconciliation {
    const envText = getRuntimeEnvironmentText(settings, 'omp');
    const piSettings = getOmpProviderSettings(settings);
    const cliPathInputs = createCLIPathFingerprintInputs(
      piSettings.cliPathsByHost[getInstallationKey()],
      piSettings.cliPath,
    );
    const savedHash = piSettings.environmentHash;

    const environment = parseEnvironmentVariables(envText);
    const hasFingerprintInputs = Boolean(
      hasCLIPathFingerprintInputs(cliPathInputs)
      || OMP_ENV_HASH_KEYS.some(key => Object.prototype.hasOwnProperty.call(environment, key))
    );
    if (!savedHash && !hasFingerprintInputs) {
      return { changed: false };
    }
    const current = computeOmpFingerprints(envText, cliPathInputs);
    const { changed, sessionPolicy } = compareScopedRuntimeInputFingerprints(
      { environmentHash: savedHash, sessionEnvironmentHash: piSettings.sessionEnvironmentHash },
      current,
      computeOmpSessionFingerprint(''),
    );
    if (!changed) {
      return { changed: false };
    }

    updateOmpProviderSettings(settings, {
      environmentHash: current.runtime,
      sessionEnvironmentHash: current.session,
    });
    return { changed: true, sessionPolicy };
  },

  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    const piSettings = getOmpProviderSettings(settings);
    let changed = false;

    const envText = getRuntimeEnvironmentText(settings, 'omp');
    const cliPathInputs = createCLIPathFingerprintInputs(
      piSettings.cliPathsByHost[getInstallationKey()],
      piSettings.cliPath,
    );
    if (isCurrentLegacyOmpFingerprint(
      envText,
      piSettings.environmentHash,
      cliPathInputs,
    )) {
      const current = computeOmpFingerprints(envText, cliPathInputs);
      updateOmpProviderSettings(settings, {
        environmentHash: current.runtime,
        sessionEnvironmentHash: current.session,
      });
      changed = true;
    }

    return changed;
  },
} satisfies ProviderSettingsReconciler;
