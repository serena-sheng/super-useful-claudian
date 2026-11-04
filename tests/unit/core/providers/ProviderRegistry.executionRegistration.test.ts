import '@/providers';

import { withRuntimeHosts } from '@test/helpers/providerRuntimeHost';

import { ProviderExecutionLifecycleRegistry } from '@/core/execution';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { DeepSeekExecutionBackend } from '@/providers/deepseek/execution/DeepSeekExecutionBackend';
import { OmpExecutionBackend } from '@/providers/omp/execution/OmpExecutionBackend';

function createHost(): any {
  const executionLifecycleRegistry = new ProviderExecutionLifecycleRegistry();
  return withRuntimeHosts({
    app: {
      vault: { adapter: { basePath: '/tmp/provider-registration' } },
    },
    executionLifecycleRegistry,
    getActiveEnvironmentVariables: jest.fn(() => ''),
    getResolvedProviderCliPath: jest.fn(),
    manifest: { version: 'test' },
    runProviderExecutionTransition: (
      providerIds: string[],
      mutation: () => Promise<unknown>,
    ) => executionLifecycleRegistry.runTransition(providerIds as any, mutation),
    settings: {
      providerConfigs: {
        deepseek: { enabled: true },
        omp: { enabled: true },
      },
    },
  });
}

describe('provider execution registration', () => {
  afterEach(() => {
    ProviderWorkspaceRegistry.setServices('deepseek', undefined);
    ProviderWorkspaceRegistry.setServices('omp', undefined);
  });

  it('constructs every registered backend without creating a provider session', () => {
    const host = createHost();
    ProviderWorkspaceRegistry.setServices('deepseek', {} as any);
    ProviderWorkspaceRegistry.setServices('omp', {} as any);

    expect(ProviderRegistry.createExecutionBackend(host, 'omp'))
      .toBeInstanceOf(OmpExecutionBackend);
    expect(ProviderRegistry.createExecutionBackend(host, 'deepseek'))
      .toBeInstanceOf(DeepSeekExecutionBackend);
  });

  it('registers no subagent history parity placeholders for the remaining providers', () => {
    const host = createHost();

    expect(ProviderRegistry.createSubagentHistoryService(host, 'omp')).toBeNull();
    expect(ProviderRegistry.createSubagentHistoryService(host, 'deepseek')).toBeNull();
  });
});
