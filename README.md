# Super Useful Claudian

Run **OMP (Oh My Pi)** inside your vault as the default chat collaborator, with
**DeepSeek Harness** available as an optional second provider. Two providers, one chat UI,
with provider readiness checks, a capability matrix, a token usage meter, full local session
restore and a personal pack that lives in your vault.

An independent fork of [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu.
It keeps Claudian's chat experience — chat tabs, inline editing, session manager, Zen mode,
dual pane, side chat, agent skills, turn steering, subagent history, projects, cross-session
messaging and the experimental plugin API — and adds an OMP provider alongside upstream's
DeepSeek Harness, a provider-readiness panel, a token meter, a local archive that can reopen
any saved conversation with every turn visible, and a personal pack. A few enhancements were
borrowed from [oh-my-claudian](https://github.com/lee259/oh-my-claudian) by Lee.

**2.0.0 is synced to upstream Claudian 2.3.34, plus the fixes upstream landed on `main` after
that tag.** This release deliberately keeps only two harnesses: the `claude`, `codex`, `grok`,
`opencode` and `pi` providers are gone, OMP is the default, and upstream's maintained
**DeepSeek Harness** provider (`deepseek`) remains as the optional second. The early `dsh`
provider is also gone; the plugin migrates old `dsh` settings and sessions automatically.

Both upstream projects are MIT licensed; see NOTICE.md and LICENSE.

## Requirements

- Obsidian v1.13.0+
- Desktop only (macOS, Linux, Windows)
- At least one of the two provider CLIs installed locally, plus whatever subscription or
  API access that CLI needs. OMP is the default provider; DeepSeek Harness is optional.

## Supported providers

Each provider is a locally installed agent CLI. The plugin drives it as a subprocess;
nothing is bundled and nothing is downloaded for you.

| Provider | CLI | Notes |
|---|---|---|
| **OMP (Oh My Pi)** | `omp` | Default provider. `@oh-my-pi/pi-coding-agent` — ships as a native binary; install with the omp.sh install script |
| **DeepSeek Harness** | `dsh` | Optional. `@deepseek-ai/dsh` (developer preview) — npm installs need Node.js; the CLI uses a DeepSeek account or API key |

Model choice stays with the CLI: the plugin discovers the models each installed CLI reports
rather than keeping its own model list.

## What this fork adds over upstream Claudian

- **OMP (Oh My Pi) provider**, now the default harness. Upstream's **DeepSeek Harness**
  remains the optional second provider.
- **Full local session restore**: every saved conversation is also archived inside the vault
  (`<id>.transcript.json`), so reopening it shows all saved turns even when the CLI's native
  session store was deleted, rotated, or created on another machine. Native history is still
  preferred whenever it is readable. See [docs/session-restore.md](docs/session-restore.md).
- **Provider readiness panel** at the top of each provider's settings tab: is it enabled,
  is the CLI installed and which version, was a model catalog discovered, is a model
  selected — each with a hint on what to do next. Install and update commands are shown for
  you to copy; the plugin never runs them.
- **Provider capability matrix**: which harness supports images, forking, rewind, turn
  steering, plan approval, instruction mode, provider commands and reasoning control, read
  live from the providers rather than from a table that can go stale.
- **Token usage meter**: per-turn consumption recorded locally and shown by day and by
  session, in Settings, General.
- **Instruction mode** (opt-in): type `#` in an empty composer and a rough instruction is
  rewritten into a proper prompt, asking a clarifying question first when it needs one.
- **Composer bash mode** (opt-in): type `!` to run a shell command and see its output in the
  transcript.
- **One-step steering**: while a steer-capable turn runs, a **Steer** button appears in the
  composer and Option/Alt+Enter sends the current text into that turn — no queue round trip.
  The queued-message "Steer Now" path still exists for input already sent.
- **Linked content on your terms**: a setting decides what a new chat links — the note you
  have open, or nothing at all until you pick one from the composer. An already-started
  conversation can drop its note from the composer chip (the × beside it), so a chat stops
  travelling with a vault file; it keeps its history and moves out of that note's group.
- **DeepSeek balance**: the DeepSeek Harness settings tab can read the live account balance
  from `api.deepseek.com/user/balance` with the provider's `DEEPSEEK_API_KEY`, and the status
  bar can show it. Reads happen only when you ask (the Refresh button or a click on the status
  item); there is no polling timer.
- **Personal pack**: your assistant identity lives in the vault, not in the plugin. An
  optional `.super-useful-claudian/personal/identity.md` is appended to every chat's system
  prompt, and any commands, skills or MCP servers you keep beside it stay provider-native.
  See [docs/personal-pack.md](docs/personal-pack.md).

## Disclosures

Required by the Obsidian developer policies, and true as of this fork:

- **Network use.** By default the plugin itself makes no network requests. The agent CLIs
  it launches do: they talk to their own model providers and to any MCP servers you
  configure. Which services are contacted, and with which credentials, is determined by those
  CLIs and by the environment variables you set in each provider's settings.
  There are two optional exceptions. If you turn on **Check for CLI updates**, the plugin
  queries `https://registry.npmjs.org` (public npm registry, no identifiers sent beyond the
  package names) to tell you when an installed CLI has a newer release; it is off by default.
  If you press **Refresh balance** (DeepSeek Harness settings) or click the balance item in
  the status bar, the plugin requests `https://api.deepseek.com/user/balance` with your own
  `DEEPSEEK_API_KEY`. That request is never automatic, and turning off the status-bar item
  stops it for good.
- **Files outside the vault.** Each agent CLI is started with your vault as its working
  directory, but the CLIs may read and write outside it (their own config, credentials,
  session stores and caches; OMP uses `~/.omp`, DeepSeek Harness uses `~/.dsh`). Session
  metadata is kept inside the vault under the plugin's own folder.
- **Running commands.** The optional composer bash mode runs shell commands you type
  yourself, in your vault, through your own shell — the same thing you could do in a
  terminal. It is off by default; output is capped at 1 MiB and commands are killed
  after 30 seconds. Nothing here is model-driven: it only runs what you type after `!`.
- **What is stored locally.** The plugin keeps its settings, session metadata, a per-conversation
  transcript archive and a token usage log inside your vault, under `.super-useful-claudian/`.
  The transcript archive contains the message text and tool output you already see in the chat;
  it exists only so the conversation can be reopened after the CLI's own history is gone, and it
  is deleted with the session. The usage log records, per turn, the conversation id, provider,
  model and token counts — never message content — and is trimmed to 90 days. Nothing is
  uploaded anywhere by the plugin itself.
- **Personal pack.** If `.super-useful-claudian/personal/identity.md` exists in the vault, the
  plugin reads it to append personal instructions to chat prompts. It is plain local text: the
  plugin never uploads it, and deleting the file removes the instructions. No other file in
  that folder is read by the plugin.
- **Paid services.** Some providers require a paid subscription or API key. The plugin
  does not sell anything and does not install or update any CLI for you.
- **Desktop only.** `isDesktopOnly` is true: the plugin spawns subprocesses through Node
  APIs and cannot work on mobile.

## Installing

Available in the Obsidian community directory: open **Settings → Community plugins → Browse**,
search for **Super Useful Claudian**, or follow
`obsidian://show-plugin?id=super-useful-claudian`.

You can also install it manually or via BRAT:

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `YOUR_VAULT/.obsidian/plugins/super-useful-claudian/`.
3. Enable **Super Useful Claudian** in Settings, Community plugins.

This fork registers its own view type and keeps its own `.super-useful-claudian/` storage, so it can
sit next to upstream **Claudian** without either one registering the same view or
overwriting the other's settings. Install whichever you want to use.

## Building

```sh
npm ci
npm run build      # produces main.js and styles.css in the repository root
```

Requires Node.js 24.x. `npm run test:unit` runs the unit suite; `npm run typecheck` and
`npm run lint` are also wired up. `npm run build` copies the artifacts to the plugin folder
when `OBSIDIAN_VAULT` is set in `.env.local`.

## Configuration

Settings live in `.super-useful-claudian/` inside your vault. The plugin stores its settings file,
session metadata and cached catalogs there — separate from upstream Claudian, which uses
`.claudian/`, so the two can coexist on disk without corrupting each other.

Personal instructions live beside them in `.super-useful-claudian/personal/identity.md`; see
[docs/personal-pack.md](docs/personal-pack.md) for the optional commands, skills and MCP layout.

## Credits

- [Claudian](https://github.com/YishenTu/claudian) — Yishen Tu (MIT). The architecture,
  the provider framework and the chat UI are theirs, and the DeepSeek Harness provider is
  kept from upstream Claudian.
- [oh-my-claudian](https://github.com/lee259/oh-my-claudian) — Lee (MIT). Several
  enhancements in this fork were ported from it, and it was the reference for the OMP
  provider.
