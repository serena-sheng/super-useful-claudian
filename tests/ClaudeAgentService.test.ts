import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  setMockMessages,
  resetMockMessages,
  getLastOptions,
  getLastResponse,
} from '@anthropic-ai/claude-agent-sdk';

// Mock fs module
jest.mock('fs');

// Now import after all mocks are set up
import { ClaudeAgentService } from '../src/ClaudeAgentService';

// Create a mock plugin
function createMockPlugin(settings = {}) {
  return {
    settings: {
      enableBlocklist: true,
      blockedCommands: [
        'rm -rf',
        'rm -r /',
        'chmod 777',
        'chmod -R 777',
        'mkfs',
        'dd if=',
        '> /dev/sd',
      ],
      showToolUse: true,
      ...settings,
    },
    app: {
      vault: {
        adapter: {
          basePath: '/test/vault/path',
        },
      },
    },
  } as any;
}

describe('ClaudeAgentService', () => {
  let service: ClaudeAgentService;
  let mockPlugin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockMessages();
    mockPlugin = createMockPlugin();
    service = new ClaudeAgentService(mockPlugin);
  });

  describe('shouldBlockCommand', () => {
    it('should block dangerous rm commands', async () => {
      // Set up mock for fs.existsSync to find claude CLI
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      // Set up mock messages that include a dangerous bash command
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'rm -rf /' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('delete everything')) {
        chunks.push(chunk);
      }

      // Should have a blocked chunk
      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
      expect(blockedChunk?.content).toContain('rm -rf');
    });

    it('should block chmod 777 commands', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'chmod 777 /etc/passwd' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('change permissions')) {
        chunks.push(chunk);
      }

      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
      expect(blockedChunk?.content).toContain('chmod 777');
    });

    it('should allow safe commands when blocklist is enabled', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'ls -la' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('list files')) {
        chunks.push(chunk);
      }

      // Should NOT have a blocked chunk
      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeUndefined();

      // Should have the tool_use chunk
      const toolUseChunk = chunks.find((c) => c.type === 'tool_use');
      expect(toolUseChunk).toBeDefined();
    });

    it('should not block commands when blocklist is disabled', async () => {
      mockPlugin = createMockPlugin({ enableBlocklist: false });
      service = new ClaudeAgentService(mockPlugin);

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'rm -rf /' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('delete everything')) {
        chunks.push(chunk);
      }

      // Should NOT have a blocked chunk when blocklist is disabled
      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeUndefined();

      // Should have the tool_use chunk
      const toolUseChunk = chunks.find((c) => c.type === 'tool_use');
      expect(toolUseChunk).toBeDefined();
    });

    it('should block mkfs commands', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'mkfs.ext4 /dev/sda1' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('format disk')) {
        chunks.push(chunk);
      }

      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
      expect(blockedChunk?.content).toContain('mkfs');
    });

    it('should block dd if= commands', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'dd if=/dev/zero of=/dev/sda' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('wipe disk')) {
        chunks.push(chunk);
      }

      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
      expect(blockedChunk?.content).toContain('dd if=');
    });
  });

  describe('findClaudeCLI', () => {
    it('should find claude CLI in ~/.claude/local/claude', async () => {
      const homeDir = os.homedir();
      const expectedPath = path.join(homeDir, '.claude', 'local', 'claude');

      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === expectedPath;
      });

      // We need to trigger query to have it find the CLI
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }

      // Should not have error about CLI not found
      const errorChunk = chunks.find(
        (c) => c.type === 'error' && c.content.includes('Claude CLI not found')
      );
      expect(errorChunk).toBeUndefined();
    });

    it('should return error when claude CLI not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const chunks: any[] = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find((c) => c.type === 'error');
      expect(errorChunk).toBeDefined();
      expect(errorChunk?.content).toContain('Claude CLI not found');
    });
  });

  describe('transformSDKMessage', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    it('should transform assistant text messages', async () => {
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'This is a test response' }] },
        },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }

      const textChunk = chunks.find((c) => c.type === 'text');
      expect(textChunk).toBeDefined();
      expect(textChunk?.content).toBe('This is a test response');
    });

    it('should transform tool_use messages', async () => {
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/test/file.txt' },
        },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('read file')) {
        chunks.push(chunk);
      }

      const toolUseChunk = chunks.find((c) => c.type === 'tool_use');
      expect(toolUseChunk).toBeDefined();
      expect(toolUseChunk?.name).toBe('Read');
      expect(toolUseChunk?.input).toEqual({ file_path: '/test/file.txt' });
    });

    it('should transform tool_result messages', async () => {
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_result',
          content: 'File contents here',
        },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('read file')) {
        chunks.push(chunk);
      }

      const toolResultChunk = chunks.find((c) => c.type === 'tool_result');
      expect(toolResultChunk).toBeDefined();
      expect(toolResultChunk?.content).toBe('File contents here');
    });

    it('should transform error messages', async () => {
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'error',
          error: 'Something went wrong',
        },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('do something')) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find((c) => c.type === 'error' && c.content === 'Something went wrong');
      expect(errorChunk).toBeDefined();
    });

    it('should capture session ID from init message', async () => {
      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'my-session-123' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }

      // The session ID should be captured internally
      // We can verify this by checking if we get a valid response
      expect(chunks.some((c) => c.type === 'text')).toBe(true);
    });

    it('should resume previous session on subsequent queries', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'resume-session' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'First run' }] } },
        { type: 'result' },
      ]);

      for await (const _ of service.query('first')) {
        // drain
      }

      setMockMessages([
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Second run' }] } },
        { type: 'result' },
      ]);

      for await (const _ of service.query('second')) {
        // drain
      }

      const options = getLastOptions();
      expect(options?.resume).toBe('resume-session');
    });
  });

  describe('cancel', () => {
    it('should abort ongoing request', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } },
      ]);

      // Start a query
      const queryGenerator = service.query('hello');

      // Get first chunk to start the query
      await queryGenerator.next();

      // Cancel should not throw
      expect(() => service.cancel()).not.toThrow();
    });

    it('should call interrupt on underlying stream when aborted', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'cancel-session' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Chunk 1' }] } },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'Chunk 2' }] } },
        { type: 'result' },
      ]);

      const generator = service.query('streaming');

      // Prime the stream
      await generator.next();

      service.cancel();

      const chunks: any[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      const response = getLastResponse();
      expect(response?.interrupt).toHaveBeenCalled();
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('should handle cancel when no query is running', () => {
      // Cancel when no query should not throw
      expect(() => service.cancel()).not.toThrow();
    });
  });

  describe('resetSession', () => {
    it('should reset session without throwing', () => {
      expect(() => service.resetSession()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should call cancel and resetSession', () => {
      const cancelSpy = jest.spyOn(service, 'cancel');
      const resetSessionSpy = jest.spyOn(service, 'resetSession');

      service.cleanup();

      expect(cancelSpy).toHaveBeenCalled();
      expect(resetSessionSpy).toHaveBeenCalled();
    });
  });

  describe('getVaultPath', () => {
    it('should return error when vault path cannot be determined', async () => {
      mockPlugin = {
        ...mockPlugin,
        app: {
          vault: {
            adapter: {},
          },
        },
      };
      service = new ClaudeAgentService(mockPlugin);

      const chunks: any[] = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find(
        (c) => c.type === 'error' && c.content.includes('vault path')
      );
      expect(errorChunk).toBeDefined();
    });
  });

  describe('regex pattern matching in blocklist', () => {
    it('should handle regex patterns in blocklist', async () => {
      mockPlugin = createMockPlugin({
        blockedCommands: ['rm\\s+-rf', 'chmod\\s+7{3}'],
      });
      service = new ClaudeAgentService(mockPlugin);

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'rm   -rf /home' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('delete')) {
        chunks.push(chunk);
      }

      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
    });

    it('should fallback to includes for invalid regex', async () => {
      mockPlugin = createMockPlugin({
        blockedCommands: ['[invalid regex'],
      });
      service = new ClaudeAgentService(mockPlugin);

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      setMockMessages([
        { type: 'system', subtype: 'init', session_id: 'test-session' },
        {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'something with [invalid regex inside' },
        },
        { type: 'result' },
      ]);

      const chunks: any[] = [];
      for await (const chunk of service.query('test')) {
        chunks.push(chunk);
      }

      const blockedChunk = chunks.find((c) => c.type === 'blocked');
      expect(blockedChunk).toBeDefined();
    });
  });
});
