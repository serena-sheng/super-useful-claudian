# Personal pack

Super Useful Claudian is a general-purpose harness: it runs the agent CLIs you already have
installed and adds the chat UI around them. Anything that belongs to *you* rather than to the
plugin — the assistant's identity, your slash commands, your skills, your MCP servers — can
live in one folder inside the vault and be plugged in or removed without touching the plugin.

An empty or missing pack is the stock plugin. Nothing personal ships in the release.

## What the plugin reads

Exactly one file:

```
.super-useful-claudian/personal/identity.md
```

When it exists, its text is appended to every chat's system prompt as `## Personal
Instructions`, after **Custom Instructions** and before any project instructions. The plugin
reloads it when you save the file and drops the section when you delete it. It is plain local
text: never uploaded, never shown in the transcript, and no other file in the folder is read
by the plugin.

## What the CLIs read themselves

Commands, skills and MCP servers are owned by the agent CLIs, not by the plugin. Keep the
sources in the pack and link them where each tool already looks:

| Part | Pack path | Link or copy to | Loaded by |
|---|---|---|---|
| Commands | `commands/*.md` | `.claude/commands/` | Claude Code |
| Commands | `commands/*.md` | `.omp/commands/` | Oh My Pi (OMP), Pi |
| Commands | `commands/*.md` | `.codex/commands/` | Codex CLI |
| Skills | `skills/<name>/SKILL.md` | `.agents/skills/` | this plugin's Skills panel |
| MCP servers | `mcp.json` | `.mcp.json` in the vault root | CLIs that read the project MCP config (Claude Code, OMP, Pi) |

A symlink keeps one source of truth while the CLIs still see a normal directory. On Windows,
or where symlinks are impractical, copy the files and re-copy them after editing.

Commands are prompt templates with optional frontmatter, for example:

```markdown
---
description: Summarize the note I have open
---
Read the note I have open and summarize it in five bullets. Do not modify the note.
```

## Install

```sh
cd "/path/to/your/vault"             # the vault root, not the pack
PACK=".super-useful-claudian/personal"
mkdir -p "$PACK/commands" "$PACK/skills"

printf '%s\n' 'You are the assistant for this vault. Keep replies short.' > "$PACK/identity.md"

ln -s "$PWD/$PACK/commands" .claude/commands   # Claude Code
ln -s "$PWD/$PACK/commands" .omp/commands      # OMP / Pi
ln -s "$PWD/$PACK/skills"   .agents/skills     # Skills panel
```

To add MCP servers, copy the example to the vault root and edit it:

```sh
cp "$PACK/mcp.json" .mcp.json
```

A new identity takes effect on the next turn; commands and MCP servers are read when a CLI
starts, so start a new chat after changing them.

## Remove

Delete the folder and the symlinks. The plugin falls back to its stock prompt and the CLIs stop
seeing the commands. Nothing else needs to be cleaned up.

```sh
rm .claude/commands .omp/commands .agents/skills
rm -rf .super-useful-claudian/personal
```

Only remove links you created; if a path already existed, restore it instead.

## Start from the example

Copy [`examples/personal-pack/`](../examples/personal-pack/) into
`.super-useful-claudian/personal/` in your vault and replace the placeholder text.

## What does not belong in the repository

Keep the pack in your vault (or a private repository) and out of this project. The plugin's
release assets are built from this repository only, so a personal pack never ships with it.
