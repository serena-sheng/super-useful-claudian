import type {
  ProviderExecutionBackend,
  ProviderExecutionSession,
  ProviderSessionConfig,
} from '../../../core/execution';
import type { ProviderRuntimeHost } from '../../../core/providers/ProviderRuntimeHost';
import {
  createOmpForkSessionFile,
  rollbackCreatedOmpForkSessionFile,
} from '../history/OmpHistoryStore';
import type { OmpExtensionUIRenderer } from '../runtime/OmpExtensionUIBridge';
import {
  createOmpExecutionKernel,
  type OmpExecutionKernelFactory,
} from './OmpExecutionKernel';
import { OmpExecutionSession } from './OmpExecutionSession';

export interface OmpExecutionBackendOptions {
  readonly createForkSessionFile?: typeof createOmpForkSessionFile;
  readonly createKernel?: OmpExecutionKernelFactory;
  readonly extensionUiRenderer?: OmpExtensionUIRenderer | null;
  readonly rollbackForkSessionFile?: typeof rollbackCreatedOmpForkSessionFile;
}

export class OmpExecutionBackend implements ProviderExecutionBackend {
  readonly providerId = 'omp' as const;

  constructor(
    private readonly host: ProviderRuntimeHost,
    private readonly options: OmpExecutionBackendOptions = {},
  ) {}

  createSession(config: ProviderSessionConfig): ProviderExecutionSession {
    return new OmpExecutionSession(
      this.host,
      config,
      {
        createForkSessionFile: this.options.createForkSessionFile
          ?? createOmpForkSessionFile,
        createKernel: this.options.createKernel ?? createOmpExecutionKernel,
        extensionUiRenderer: this.options.extensionUiRenderer ?? null,
        rollbackForkSessionFile: this.options.rollbackForkSessionFile
          ?? rollbackCreatedOmpForkSessionFile,
      },
    );
  }
}
