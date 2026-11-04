import '@/providers';

import { runtimeHostFor } from '@test/helpers/providerRuntimeHost';

const mockTransportRequest = jest.fn();
const mockTransportSend = jest.fn();
const mockTransportStart = jest.fn();
const mockTransportDispose = jest.fn();
const mockTransportOnEvent = jest.fn();
const mockRemoveEventListener = jest.fn();
const mockProcessStart = jest.fn();
const mockProcessShutdown = jest.fn().mockResolvedValue(undefined);
const mockProcessOnClose = jest.fn();
const mockGetStderrSnapshot = jest.fn(() => '');
let mockEventHandlers: Array<(event: Record<string, unknown>) => void> = [];

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function emitTransportEvent(event: Record<string, unknown>): void {
  for (const handler of mockEventHandlers) {
    handler(event);
  }
}

const readyFrame = {
  maxFrameBytes: 1048576,
  maxReassembledFrameBytes: 8388608,
  protocolVersion: 1,
  supportedProtocolVersions: [1],
  type: 'ready',
};

jest.mock('@/providers/omp/runtime/OmpRPCTransport', () => ({
  OmpRPCTransport: jest.fn().mockImplementation(() => ({
    dispose: mockTransportDispose,
    onEvent: mockTransportOnEvent,
    request: mockTransportRequest,
    send: mockTransportSend,
    start: mockTransportStart,
  })),
}));

jest.mock('@/providers/omp/runtime/OmpSubprocess', () => ({
  OmpSubprocess: jest.fn().mockImplementation(() => ({
    getStderrSnapshot: mockGetStderrSnapshot,
    onClose: mockProcessOnClose,
    shutdown: mockProcessShutdown,
    start: mockProcessStart,
    stdin: {},
    stdout: {},
  })),
}));

import { OmpModelDiscoveryService } from '@/providers/omp/runtime/OmpModelDiscoveryService';

function createPlugin() {
  return {
    workingDirectory: '/tmp/vault',
    getResolvedProviderCliPath: jest.fn(() => '/usr/local/bin/omp'),
    settings: {
      providerConfigs: {
        omp: {
          enabled: true,
        },
      },
    },
  } as any;
}

describe('OmpModelDiscoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEventHandlers = [];
    mockGetStderrSnapshot.mockReturnValue('');
    mockTransportOnEvent.mockImplementation((handler: (event: Record<string, unknown>) => void) => {
      mockEventHandlers.push(handler);
      return mockRemoveEventListener;
    });
  });

  it('does not launch OMP when the provider is disabled', async () => {
    const plugin = createPlugin();
    plugin.settings.providerConfigs.omp.enabled = false;

    const result = await new OmpModelDiscoveryService(runtimeHostFor(plugin, 'omp')).discoverModels();

    expect(result).toEqual({ kind: 'skipped', reason: 'provider-disabled' });
    expect(plugin.getResolvedProviderCliPath).not.toHaveBeenCalled();
    expect(mockProcessStart).not.toHaveBeenCalled();
    expect(mockTransportStart).not.toHaveBeenCalled();
    expect(mockTransportRequest).not.toHaveBeenCalled();
  });

  it('discovers and normalizes OMP models through a short-lived no-session runtime', async () => {
    mockTransportRequest.mockResolvedValue({
      models: [{
        contextWindow: 200000,
        id: 'gpt-5',
        input: ['text', 'image'],
        maxTokens: 8192,
        name: 'GPT-5',
        provider: 'openai',
        reasoning: true,
        thinkingLevelMap: {
          max: 'max',
        },
      }],
    });

    const discovery = new OmpModelDiscoveryService(runtimeHostFor(createPlugin(), 'omp')).discoverModels();
    await flush();
    // The ready frame arms chunked protocol; the catalog request must come after it.
    expect(mockTransportRequest).not.toHaveBeenCalled();
    emitTransportEvent(readyFrame);
    const result = await discovery;

    expect(result.kind).toBe('completed');
    if (result.kind !== 'completed') {
      throw new Error('Expected completed OMP model discovery');
    }
    expect(result.diagnostics).toBeUndefined();
    expect(result.models).toEqual([{
      contextWindow: 200000,
      encodedId: 'omp:openai/gpt-5',
      id: 'gpt-5',
      input: ['text', 'image'],
      label: 'GPT-5',
      maxTokens: 8192,
      provider: 'openai',
      reasoning: true,
      thinkingLevels: ['off', 'minimal', 'low', 'medium', 'high', 'max'],
    }]);
    expect(mockProcessStart).toHaveBeenCalled();
    expect(mockTransportStart).toHaveBeenCalled();
    expect(mockTransportRequest).toHaveBeenCalledWith('get_available_models', {}, 20_000);
    expect(mockRemoveEventListener).toHaveBeenCalled();
    expect(mockTransportDispose).toHaveBeenCalled();
    expect(mockProcessShutdown).toHaveBeenCalled();
  });

  it('cancels extension UI requests during discovery', async () => {
    mockTransportRequest.mockImplementation(async () => {
      emitTransportEvent({
        id: 'ui-1',
        type: 'extension_ui_request',
      });
      return { models: [] };
    });

    const discovery = new OmpModelDiscoveryService(runtimeHostFor(createPlugin(), 'omp')).discoverModels();
    await flush();
    emitTransportEvent(readyFrame);
    await discovery;

    expect(mockTransportSend).toHaveBeenCalledWith({
      cancelled: true,
      id: 'ui-1',
      type: 'extension_ui_response',
    });
  });

  it('returns diagnostics and still shuts down when discovery fails', async () => {
    mockTransportRequest.mockRejectedValue(new Error('not logged in'));
    mockGetStderrSnapshot.mockReturnValue('OMP stderr');

    const discovery = new OmpModelDiscoveryService(runtimeHostFor(createPlugin(), 'omp')).discoverModels();
    await flush();
    emitTransportEvent(readyFrame);
    const result = await discovery;

    expect(result).toEqual({
      diagnostics: 'not logged in\n\nOMP stderr',
      kind: 'completed',
      models: [],
    });
    expect(mockTransportDispose).toHaveBeenCalled();
    expect(mockProcessShutdown).toHaveBeenCalled();
  });

  it('releases the runtime when aborted while waiting for the ready frame', async () => {
    const controller = new AbortController();
    const discovery = new OmpModelDiscoveryService(runtimeHostFor(createPlugin(), 'omp'))
      .discoverModels(controller.signal);
    await flush();
    expect(mockTransportRequest).not.toHaveBeenCalled();

    controller.abort();

    await expect(discovery).resolves.toEqual({
      diagnostics: 'OMP model discovery aborted',
      kind: 'completed',
      models: [],
    });
    expect(mockTransportDispose).toHaveBeenCalled();
    expect(mockProcessShutdown).toHaveBeenCalled();
  });
});
