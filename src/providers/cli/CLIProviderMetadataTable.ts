import type { CLIProviderMetadata } from '../../core/providers/cli/CLIProviderMetadata';
import { DEEPSEEK_CLI_METADATA } from '../deepseek/runtime/DeepSeekCLIMetadata';
import { OMP_CLI_METADATA } from '../omp/runtime/OmpCLIMetadata';

/**
 * Every built-in provider's CLI lifecycle metadata, keyed by provider id.
 *
 * A provider owns its entry in `src/providers/<id>/runtime/<Id>CLIMetadata.ts`;
 * this table only aggregates them so tests and consumers can enumerate every
 * provider without importing them one by one.
 */
export const CLI_PROVIDER_METADATA = {
  deepseek: DEEPSEEK_CLI_METADATA,
  omp: OMP_CLI_METADATA,
} as const satisfies Readonly<Record<string, CLIProviderMetadata>>;
