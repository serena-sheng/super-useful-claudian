import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import type ClaudeAgentPlugin from './main';
import { StreamChunk } from './types';

export class ClaudeAgentService {
  private plugin: ClaudeAgentPlugin;
  private abortController: AbortController | null = null;
  private sessionId: string | null = null;
  private resolvedClaudePath: string | null = null;

  constructor(plugin: ClaudeAgentPlugin) {
    this.plugin = plugin;
  }

  /**
   * Find the claude CLI binary by checking common installation locations
   */
  private findClaudeCLI(): string | null {
    // Common installation locations
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

  /**
   * Send a query to Claude and stream the response
   */
  async *query(prompt: string): AsyncGenerator<StreamChunk> {
    // Get vault path
    const vaultPath = this.getVaultPath();
    if (!vaultPath) {
      yield { type: 'error', content: 'Could not determine vault path' };
      return;
    }

    // Find claude CLI - cache the result
    if (!this.resolvedClaudePath) {
      this.resolvedClaudePath = this.findClaudeCLI();
    }

    if (!this.resolvedClaudePath) {
      yield { type: 'error', content: 'Claude CLI not found. Please install Claude Code CLI.' };
      return;
    }

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    try {
      yield* this.queryViaSDK(prompt, vaultPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    } finally {
      this.abortController = null;
    }
  }

  private async *queryViaSDK(prompt: string, cwd: string): AsyncGenerator<StreamChunk> {
    const options: Options = {
      cwd,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: 'claude-haiku-4-5',
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS'],
      abortController: this.abortController ?? undefined,
      pathToClaudeCodeExecutable: this.resolvedClaudePath!,
    };

    // Resume previous session if we have a session ID
    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    try {
      const response = query({ prompt, options });

      for await (const message of response) {
        // Check for cancellation
        if (this.abortController?.signal.aborted) {
          await response.interrupt();
          break;
        }

        const transformed = this.transformSDKMessage(message);
        if (transformed) {
          // Check blocklist for bash commands
          if (transformed.type === 'tool_use' && transformed.name === 'Bash') {
            const command = (transformed as any).input?.command || '';
            if (this.shouldBlockCommand(command)) {
              yield { type: 'blocked', content: `Blocked command: ${command}` };
              continue;
            }
          }
          yield transformed;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      yield { type: 'error', content: msg };
    }

    yield { type: 'done' };
  }

  /**
   * Transform SDK message to our StreamChunk format
   */
  private transformSDKMessage(message: any): StreamChunk | null {
    switch (message.type) {
      case 'system':
        // Capture session ID from init message
        if (message.subtype === 'init' && message.session_id) {
          this.sessionId = message.session_id;
        }
        // Don't yield system messages to the UI
        return null;

      case 'assistant':
        // Extract text from content blocks
        if (message.message?.content) {
          const textBlocks = message.message.content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('');
          if (textBlocks) {
            return { type: 'text', content: textBlocks };
          }
        }
        break;

      case 'tool_use':
        return {
          type: 'tool_use',
          name: message.name,
          input: message.input || {},
        };

      case 'tool_result':
        return {
          type: 'tool_result',
          content: typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content),
        };

      case 'result':
        // Skip - result is the terminal message
        break;

      case 'error':
        if (message.error) {
          return { type: 'error', content: message.error };
        }
        break;
    }

    return null;
  }

  /**
   * Check if a bash command should be blocked
   */
  private shouldBlockCommand(command: string): boolean {
    if (!this.plugin.settings.enableBlocklist) {
      return false;
    }

    return this.plugin.settings.blockedCommands.some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(command);
      } catch {
        // Invalid regex, try simple includes
        return command.toLowerCase().includes(pattern.toLowerCase());
      }
    });
  }

  /**
   * Get the vault's filesystem path
   */
  private getVaultPath(): string | null {
    const adapter = this.plugin.app.vault.adapter;
    if ('basePath' in adapter) {
      return (adapter as any).basePath;
    }
    return null;
  }

  /**
   * Cancel the current query
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Reset the conversation session
   * Call this when clearing the chat to start fresh
   */
  resetSession() {
    this.sessionId = null;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.cancel();
    this.resetSession();
  }
}
