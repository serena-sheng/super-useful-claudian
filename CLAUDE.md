# CLAUDE.md

## Project Overview

Obsidian Claude Agent - An Obsidian plugin that embeds Claude Code as a sidebar chat interface. The vault directory becomes Claude's working directory, giving it full agentic capabilities: file read/write, bash commands, and multi-step workflows.

**Core Principle**: "Claude Code in a sidebar" - the full Claude Code experience embedded in Obsidian.

## Architecture

```
src/
├── main.ts              # Plugin entry point, registers view and settings
├── ClaudeAgentView.ts   # Sidebar chat UI (ItemView)
├── ClaudeAgentService.ts # Claude Agent SDK wrapper, handles streaming
├── ClaudeAgentSettings.ts # Settings tab
└── types.ts             # Shared type definitions
```

## Key Technologies

- **Claude Agent SDK**: `@anthropic-ai/claude-agent-sdk` for Claude integration
- **Obsidian API**: Plugin framework, ItemView for sidebar, MarkdownRenderer
- **Build**: esbuild with TypeScript
- **Target**: Desktop only (macOS, Linux, Windows via WSL)

## Commands

```bash
# Development (watch mode)
npm run dev

# Production build
npm run build

# Install dependencies
npm install
```

## Key Implementation Patterns

### Claude Agent SDK Usage
```typescript
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';

const options: Options = {
  cwd: vaultPath,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  model: 'claude-haiku-4-5',
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS'],
  abortController: this.abortController,
  pathToClaudeCodeExecutable: '/path/to/claude',
  resume: sessionId, // Optional: resume previous session
};

const response = query({ prompt, options });
for await (const message of response) {
  // Handle streaming messages
}
```

### Obsidian View Registration
```typescript
this.registerView(VIEW_TYPE_CLAUDE_AGENT, (leaf) => new ClaudeAgentView(leaf, this));
```

### Vault Path Access
```typescript
const vaultPath = this.app.vault.adapter.basePath;
```

### Markdown Rendering
```typescript
await MarkdownRenderer.renderMarkdown(markdown, container, sourcePath, component);
```

## Message Types from SDK

| Type | Description |
|------|-------------|
| `system` | Session initialization, metadata (includes session_id) |
| `assistant` | Claude's text responses |
| `tool_use` | Claude invoking a tool (file read, bash, etc.) |
| `tool_result` | Result of tool execution |
| `result` | Terminal message (final response) |
| `error` | Error messages |

## Settings Structure

```typescript
interface ClaudeAgentSettings {
  enableBlocklist: boolean;      // Block dangerous commands
  blockedCommands: string[];     // Regex patterns to block
  showToolUse: boolean;          // Show file operations in chat
}
```

## Default Blocked Commands

- `rm -rf`
- `rm -r /`
- `chmod 777`
- `chmod -R 777`
- `mkfs`
- `dd if=`
- `> /dev/sd`

## File Outputs

- `main.js` - Bundled plugin code
- `styles.css` - Plugin styles
- `manifest.json` - Obsidian plugin manifest

## External Dependencies

- User must have Claude Code CLI installed (SDK uses it internally via `pathToClaudeCodeExecutable`)
- Obsidian v1.0.0+

## CSS Class Conventions

- `.claude-agent-container` - Main container
- `.claude-agent-messages` - Messages scroll area
- `.claude-agent-message` - Individual message
- `.claude-agent-message-user` - User message styling
- `.claude-agent-message-assistant` - Assistant message styling
- `.claude-agent-input-container` - Input area wrapper
- `.claude-agent-input` - Textarea input
- `.claude-agent-send-btn` - Send button
- `.claude-agent-tool-use` - Tool use indicators
