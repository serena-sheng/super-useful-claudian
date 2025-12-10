# Claudian

An Obsidian plugin that embeds Claude Agent (using Claude Agent SDK) as a sidebar chat interface. Your vault becomes Claude's working directory, giving it full agentic capabilities: file read/write, bash commands, and multi-step workflows.

## Features

- **Full Agentic Capabilities**: Leverage Claude Code's power to read, write, and edit files, and execute bash commands, all within your Obsidian vault.
- **Context-Aware**: Automatically attach the focused note, mention files with `@`, and exclude notes by tag for precise context management.
- **Vision Support**: Analyze images by sending them via drag-and-drop, paste, or file path.
- **Inline Edit**: Edit selected text directly in notes with word-level diff preview and read-only tool access for context.
- **Dynamic Responses**: Experience real-time streaming, observe Claude's extended reasoning process, and cancel responses mid-stream.
- **Advanced Model Control**: Select between Haiku, Sonnet, and Opus, configure custom models via environment variables, and fine-tune thinking budget.
- **Transparent Tooling**: Visualize tool calls, subagent activity, and track asynchronous subagent operations with detailed UI feedback.
- **Persistent Sessions**: Save and resume conversations with full context across sessions.
- **Robust Security**: Implement permission modes (Yolo/Safe), a safety blocklist, and vault confinement with symlink-safe checks.
- **Intuitive File Management**: See indicators for edited files, with smart detection, auto-dismissal, and quick access.

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (the SDK uses it internally)
- Obsidian v1.0.0+
- Desktop only (macOS, Linux, Windows via WSL)

## Installation

### From source (development)

1. Clone this repository into your vault's plugins folder:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/YishenTu/claudian.git
   cd claudian
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian:
   - Settings → Community plugins → Enable "Claudian"

### Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Production build
npm run build
```

## Usage

1. Click the bot icon in the ribbon (left sidebar) to open Claudian
2. Type your message and press Enter to send (Shift+Enter for newline)
3. Claude can read, write, and edit files in your vault
4. Click on tool call headers to expand and see inputs/results

### File Context

- **Auto-attach**: New conversations auto-attach the currently focused note
- **@ mention**: Type `@` anywhere to search and attach files from your vault
- **Remove**: Click `×` on a file chip to remove it
- **Excluded tags**: Notes with tags listed in Settings → Excluded tags won't auto-attach (but can still be manually attached via `@`)
- Files are sent as context with your message; Claude will read them to understand your question

### Image Context

Send images to Claude for analysis, description, or any vision-related task.

**Adding images:**
- **Drag and drop**: Drag image files onto the input area
- **Copy/paste**: Paste images from clipboard (Cmd/Ctrl+V)
- **File path**: Include an image path in your message (auto-detected)

**Supported formats:** JPEG, PNG, GIF, WebP (max 5MB per image)

**Path detection examples:**
- Quoted: `"path/to/image.jpg"` or `'path/to/image.png'`
- Relative: `./screenshots/error.png`
- Vault-relative: `attachments/diagram.png`

**Embedded images in notes:**
When you configure a media folder in settings, Claude can read embedded images:
```markdown
![[screenshot.png]]  →  Claude reads from configured media folder
```

**External images:**
Standard markdown images with URLs require download first (WebFetch doesn't support images):
```markdown
![diagram](https://example.com/arch.png)  →  Claude downloads with curl, then reads locally
```

### Inline Edit

Edit selected text directly in your notes without opening the sidebar chat.

1. **Select text** in any note
2. **Press hotkey** (configure via Settings → Hotkeys → "Claudian: Inline edit")
3. **Enter instructions** (e.g., "make concise", "fix grammar", "translate to French")
4. **Review the diff** - word-level changes shown inline
5. **Accept (Enter) or Reject (Esc)**

**Features:**
- **@ mentions**: Reference other notes for context
- **Read-only tools**: Agent can read files for context but cannot modify them
- **Inline diff**: Precise word-level diff with red strikethrough (deletions) and green highlight (insertions)

The inline edit agent has access to `Read`, `Grep`, `Glob`, and `LS` tools for gathering context, but write tools are blocked.

### Example prompts

- "List all notes in this vault"
- "Create a new note called 'Ideas' with a template for brainstorming"
- "Find all notes tagged #project and summarize them"
- "Organize my daily notes into monthly folders"
- "Summarize this note" (with a note attached via @ or auto-attach)

## Configuration

### Settings

- **Enable command blocklist**: Block dangerous bash commands (default: on)
- **Blocked commands**: Patterns to block (supports regex)
- **Show tool usage**: Display file operations in chat
- **Excluded tags**: Tags that prevent notes from auto-loading (e.g., `system`, `private`)
- **Media folder**: Configure where vault stores attachments for embedded image support (e.g., `attachments`)
- **Environment variables**: Custom environment variables for Claude SDK (KEY=VALUE format)
- **Environment snippets**: Save and restore environment variable configurations
- **Permission mode**: Toggle Yolo (bypass prompts) or Safe (require approval)
- **Approved actions**: In Safe mode, manage permanently approved actions (Allow Once vs. Always Allow)

### Default blocklist

- `rm -rf`
- `chmod 777`
- `chmod -R 777`

### Safety and permissions

- **Vault restriction**: File tools and Bash commands are limited to the Obsidian vault. Paths are resolved with `realpath` to prevent symlink escapes; attempts outside the vault are blocked.
- **Approvals**:
  - Safe mode shows an approval modal per tool call.
  - Bash approvals require an exact command match.
  - File tools allow exact or prefix path matches.

## Privacy & Data Use

- **Outbound scope**: Content sent to Claude/custom APIs includes your input, attached files/snippets, images (base64), and model-issued tool calls plus summarized outputs. Default provider is Anthropic; if `ANTHROPIC_BASE_URL` is set, traffic goes to that endpoint.
- **Local storage**: Settings, chat history, approved actions, and environment variable snippets are stored in `.obsidian/plugins/claudian`. Image cache is written to `.claudian-cache/images`; you can clear it when deleting conversations or uninstalling the plugin.
- **Commands & file access**: The plugin can read/write files and execute Bash commands within the vault directory; Safe mode approvals and the blocklist apply, and paths are constrained to the vault via `realpath`.
- **User controls**: You can edit the blocked-command list, switch Safe/Yolo modes, clear history, delete caches, and remove API keys; disabling the plugin stops all remote calls.
- **Telemetry**: No additional telemetry or third-party tracking. Data retention/compliance follows the terms of your configured API provider.

## Architecture

```
src/
├── main.ts              # Plugin entry point
├── ClaudianView.ts      # Sidebar chat UI, orchestrates components
├── ClaudianService.ts   # Claude Agent SDK wrapper
├── ClaudianSettings.ts  # Settings tab
├── systemPrompt.ts      # System prompt and image handling instructions
├── imageCache.ts        # Image caching utilities
├── types.ts             # Type definitions
├── utils.ts             # Utility functions (env var parsing, model detection)
├── InlineEditService.ts # Lightweight Claude service for inline editing (read-only tools)
└── ui/                  # Modular UI components
    ├── index.ts              # Barrel export
    ├── ApprovalModal.ts      # Permission approval dialog
    ├── InputToolbar.ts       # Model/thinking/permission selectors
    ├── FileContext.ts        # File attachments & @mentions
    ├── ImageContext.ts       # Image drag/drop, paste, path detection
    ├── ToolCallRenderer.ts   # Tool call display
    ├── ThinkingBlockRenderer.ts # Extended thinking UI
    ├── TodoListRenderer.ts   # Todo list UI for task tracking
    ├── SubagentRenderer.ts   # Subagent (Task tool) UI with nested tools
    ├── EnvSnippetManager.ts  # Environment variable snippets
    └── InlineEditModal.ts    # Inline edit UI (CM6 decorations, diff view)
```

## Roadmap

- [x] Session persistence within sessions (via SDK resume)
- [x] Chat history persistence across plugin restarts
- [x] Conversation switching with history dropdown
- [x] File context awareness (auto-attach + @ mention)
- [x] Context menu: "Ask Claude about this file"
- [x] Extended thinking display (collapsible thinking blocks with live timer)
- [x] Model selection (Haiku, Sonnet, Opus)
- [x] Thinking token budget adjustment (Off/Low/Medium/High)
- [x] Permission modes (Yolo/Safe)
- [x] Edited files indicator for Claude edits (border on attachments, "Edited:" chips, click-to-open, auto-dismiss)
- [x] Modular UI architecture (extracted reusable components)
- [x] Environment variables support with snippet management
- [x] Image support (drag/drop, paste, path detection, embedded images)
- [x] Subagent (Task tool) visualization with nested tool tracking
- [x] Async subagent support (run_in_background=true)
- [x] Inline edit feature (read-only tools, word-level diff)
- [ ] Skills, Hooks, MCP and other advanced features
- [ ] Diff view in chat panel

## License

Licensed under the [MIT License](LICENSE).

## Acknowledgments

- [Obsidian](https://obsidian.md) for the plugin API
- [Anthropic](https://anthropic.com) for Claude and the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
