# What other Obsidian AI plugins do, and what we should copy

Research date: **2026-10-26**. Sources are public repositories, the Obsidian community
plugin directory and release notes. Download counts are install counts, not active users.

## Market snapshot

| Plugin | Downloads | Latest at research time | Position |
|---|---:|---|---|
| [Copilot](https://github.com/logancyang/obsidian-copilot) | 2.9M | 4.0.16, 2026-10-23 | Largest AI plugin; since 4.0 it hosts Claude Code, Codex and OpenCode |
| [Claudian](https://github.com/YishenTu/claudian) | 2.5M | 2.3.33, 2026-10-25 | Our upstream; the closest architecture to ours |
| [Agent Client](https://github.com/rait-09/obsidian-agent-client) | 313k | ACP client | Standardises agent access over ACP |
| [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) | 1.25M | 4.7.2 | Local embeddings and related notes |
| [Text Generator](https://github.com/nhaouari/obsidian-textgenerator-plugin) | 591k | beta line | Templates; effectively maintenance mode |
| [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer) | 178k | 1.2.9 | Archived direction; MCP and context picker |
| [Oh My Claudian](https://github.com/lee259/oh-my-claudian) | 5.0k | 2.5.20 | Fork: readiness, OMP, DSH, save-reply |
| [Claudian Plus](https://github.com/wuyifan-code/Claudian-plus) | 5.5k | 3.2.1 | Fork: memory V2, generative UI, DSH replay |
| [WeSight](https://github.com/freestylefly/wesight-obsidian) | 37k | 1.4.0 | Chinese-market provider UX and publishing |

The category has consolidated: pure chat plugins are decaying, while plugins that host an
installed agent CLI are growing. Copilot's 4.0 rewrite adopted exactly our architecture.

## Copilot's relevant strengths

- **Session lifecycle** — live/detached states, "Close session" keeps the saved chat,
  searchable Recent Chats with pin, `obsidian://` links back to a chat.
- **Faithful replay** — reopened Claude/OpenCode chats show tool calls and thinking as they
  appeared live, and a chat is saved as a single note that survives agent restarts.
- **Permission ladder** — Safe / Plan / Auto with inline "Permission required" cards that
  disclose whether an allow is one-time or persistent.
- **Skills and memory** — per-agent skill toggle, built-in web/PDF/YouTube skills, Markdown
  long-term memory.
- **Cost/context meter** — context and plan-window usage in the composer.
- **Managed binaries** — pinned agent downloads with in-app sign-in.

## What we copied in 1.5.0

- **Deterministic transcript replay (P0)**: provider-independent per-conversation archive
  that restores every saved turn when native history is missing. See
  [session-restore.md](session-restore.md).
- **Honest restore state**: the chat says when it is showing a local archive instead of
  silently presenting an empty session.
- **Provider consolidation**: adopt upstream's maintained DeepSeek Harness provider rather
  than carrying a second implementation, with automatic settings/session migration.

## What to copy next, in order

| Priority | Feature | Who proves it | Cost | Why |
|---|---|---|---|---|
| P0 | Session list states (live / detached / ended) with Resume and Close | Copilot 4.0.11, Agent Manager | M | The archive now guarantees content; the list still lacks lifecycle truth |
| P0 | Full-text search across sessions (prompts, replies, tool output) | Agent Atlas, Sidecar | M | The archive makes this a local index problem; "where did I ask that?" is the top complaint |
| P0 | Export/import a conversation as a Markdown note with an `obsidian://` deep link | Copilot 4.0.12–15 | S–M | Obsidian-native sharing and a human-readable backup |
| P1 | Diff-review card per reply | Copilot 4.0.15, Duet | S–M | Trust gate for vault edits; we already capture edit tool data |
| P1 | Approval cards with scope disclosure (once vs always vs rule) | Copilot, Specorator | M | Our permission UI inherits the CLI's raw prompts |
| P1 | Continue/fork in another provider | Agent Manager, Claudian Plus | L | Our unique asset is seven harnesses; cross-provider handoff is hard for Copilot |
| P2 | Cost ledger export (CSV/Markdown) | Copilot, Agent Atlas | S | We already log token usage per turn |
| P2 | Scheduled runs / off-peak queue | Miyo Automations (alpha) | M | Clear value for priced APIs, but unattended permissions are risky |
| P3 | Mobile/remote handoff | Darjeeling, Copilot remote | L | We are desktop-only by design |

Explicitly skipped: managed CLI installers (support and security burden), publishing to
external services, generative UI widgets, and image generation. They are either off-strategy
or high-maintenance.

## Design lesson

Every prominent release in the last two months was about **reopening, replaying, reviewing
or resuming** a session — not about a smarter prompt. Restoration and review are the
features that turn a chat panel into a workspace, and they are the right place for a fork to
differentiate.
