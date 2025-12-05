import {
  VIEW_TYPE_CLAUDE_AGENT,
  DEFAULT_SETTINGS,
  ClaudeAgentSettings,
  ChatMessage,
  ToolUseInfo,
  StreamChunk,
} from '../src/types';

describe('types.ts', () => {
  describe('VIEW_TYPE_CLAUDE_AGENT', () => {
    it('should be defined as the correct view type', () => {
      expect(VIEW_TYPE_CLAUDE_AGENT).toBe('claude-agent-view');
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have enableBlocklist set to true by default', () => {
      expect(DEFAULT_SETTINGS.enableBlocklist).toBe(true);
    });

    it('should have showToolUse set to true by default', () => {
      expect(DEFAULT_SETTINGS.showToolUse).toBe(true);
    });

    it('should have default blocked commands', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toBeInstanceOf(Array);
      expect(DEFAULT_SETTINGS.blockedCommands.length).toBeGreaterThan(0);
    });

    it('should block rm -rf by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('rm -rf');
    });

    it('should block rm -r / by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('rm -r /');
    });

    it('should block chmod 777 by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('chmod 777');
    });

    it('should block chmod -R 777 by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('chmod -R 777');
    });

    it('should block mkfs by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('mkfs');
    });

    it('should block dd if= by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('dd if=');
    });

    it('should block > /dev/sd by default', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toContain('> /dev/sd');
    });

    it('should have exactly 7 default blocked commands', () => {
      expect(DEFAULT_SETTINGS.blockedCommands).toHaveLength(7);
    });
  });

  describe('ClaudeAgentSettings type', () => {
    it('should be assignable with valid settings', () => {
      const settings: ClaudeAgentSettings = {
        enableBlocklist: false,
        blockedCommands: ['test'],
        showToolUse: false,
      };

      expect(settings.enableBlocklist).toBe(false);
      expect(settings.blockedCommands).toEqual(['test']);
      expect(settings.showToolUse).toBe(false);
    });
  });

  describe('ChatMessage type', () => {
    it('should accept user role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('user');
    });

    it('should accept assistant role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('assistant');
    });

    it('should accept system role', () => {
      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'system',
        content: 'System message',
        timestamp: Date.now(),
      };

      expect(msg.role).toBe('system');
    });

    it('should accept optional toolUse array', () => {
      const toolUse: ToolUseInfo[] = [
        { name: 'Read', input: { file_path: '/test.txt' } },
      ];

      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Reading file...',
        timestamp: Date.now(),
        toolUse,
      };

      expect(msg.toolUse).toEqual(toolUse);
    });
  });

  describe('ToolUseInfo type', () => {
    it('should store tool name and input', () => {
      const toolUse: ToolUseInfo = {
        name: 'Bash',
        input: { command: 'ls -la' },
      };

      expect(toolUse.name).toBe('Bash');
      expect(toolUse.input).toEqual({ command: 'ls -la' });
    });
  });

  describe('StreamChunk type', () => {
    it('should accept text type', () => {
      const chunk: StreamChunk = {
        type: 'text',
        content: 'Hello world',
      };

      expect(chunk.type).toBe('text');
      if (chunk.type === 'text') {
        expect(chunk.content).toBe('Hello world');
      }
    });

    it('should accept tool_use type', () => {
      const chunk: StreamChunk = {
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/test.txt' },
      };

      expect(chunk.type).toBe('tool_use');
      if (chunk.type === 'tool_use') {
        expect(chunk.name).toBe('Read');
        expect(chunk.input).toEqual({ file_path: '/test.txt' });
      }
    });

    it('should accept tool_result type', () => {
      const chunk: StreamChunk = {
        type: 'tool_result',
        content: 'File contents here',
      };

      expect(chunk.type).toBe('tool_result');
      if (chunk.type === 'tool_result') {
        expect(chunk.content).toBe('File contents here');
      }
    });

    it('should accept error type', () => {
      const chunk: StreamChunk = {
        type: 'error',
        content: 'Something went wrong',
      };

      expect(chunk.type).toBe('error');
      if (chunk.type === 'error') {
        expect(chunk.content).toBe('Something went wrong');
      }
    });

    it('should accept blocked type', () => {
      const chunk: StreamChunk = {
        type: 'blocked',
        content: 'Command blocked: rm -rf',
      };

      expect(chunk.type).toBe('blocked');
      if (chunk.type === 'blocked') {
        expect(chunk.content).toBe('Command blocked: rm -rf');
      }
    });

    it('should accept done type', () => {
      const chunk: StreamChunk = {
        type: 'done',
      };

      expect(chunk.type).toBe('done');
    });
  });
});
