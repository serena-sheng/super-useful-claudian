// Mock for @anthropic-ai/claude-agent-sdk

export interface Options {
  cwd?: string;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: boolean;
  model?: string;
  allowedTools?: string[];
  abortController?: AbortController;
  pathToClaudeCodeExecutable?: string;
  resume?: string;
}

// Default mock messages for testing
const mockMessages = [
  { type: 'system', subtype: 'init', session_id: 'test-session-123' },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello, I am Claude!' }] } },
  { type: 'result', result: 'completed' },
];

let customMockMessages: any[] | null = null;
let lastOptions: Options | undefined;
let lastResponse: (AsyncGenerator<any> & { interrupt: jest.Mock }) | null = null;

// Allow tests to set custom mock messages
export function setMockMessages(messages: any[]) {
  customMockMessages = messages;
}

export function resetMockMessages() {
  customMockMessages = null;
  lastOptions = undefined;
  lastResponse = null;
}

export function getLastOptions(): Options | undefined {
  return lastOptions;
}

export function getLastResponse(): (AsyncGenerator<any> & { interrupt: jest.Mock }) | null {
  return lastResponse;
}

// Mock query function that returns an async generator
export function query({ prompt, options }: { prompt: string; options: Options }): AsyncGenerator<any> & { interrupt: () => Promise<void> } {
  const messages = customMockMessages || mockMessages;
  lastOptions = options;

  const generator = async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };

  const gen = generator() as AsyncGenerator<any> & { interrupt: () => Promise<void> };
  gen.interrupt = jest.fn().mockResolvedValue(undefined);
  lastResponse = gen;

  return gen;
}
