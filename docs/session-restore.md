# Session restore

Super Useful Claudian can reopen a saved conversation with **every saved turn visible**,
without depending on the agent CLI's own session store. Native history is still used
whenever it is readable; the local archive is the fallback.

## What gets stored

For each conversation, the plugin writes one sidecar next to its metadata:

```
.super-useful-claudian/sessions/devices/<device>/<conversation-id>.transcript.json
```

The file contains the same `ChatMessage[]` the chat already rendered: user and assistant
text, thinking, tool calls and their results, timestamps and images. It is written on every
message save, deduplicated so an unchanged transcript is not rewritten, and deleted when the
conversation is deleted.

Archives are capped at 24 MiB. Oversized archives first truncate individual tool results at
32,000 characters, then drop inline image bytes. No conversation turn is ever removed, so
the restored transcript still shows every round.

## How a conversation is restored

1. The provider's native history is hydrated first. It stays authoritative because it can
   include state the plugin never rendered (branches, rewinds, provider-side compactions).
2. If native hydration succeeds with messages, the transcript is archived (so sessions
   created before this feature existed are captured the first time they are opened).
3. If native hydration returns no messages, or throws because the native session file is
   missing or unreadable, the local archive is loaded instead. The chat then shows a
   "Restored from local archive" notice above the transcript.
4. Sending a new message still goes through the provider. If its native session is gone,
   the provider decides whether to start a fresh native session; the displayed archive is
   not replayed into the model automatically.

## Limits

- Rounds that were never saved (for example a conversation that existed only in another
  installation and was never opened here) cannot be reconstructed.
- The archive is a display/recovery record, not a fork source. Branching still uses native
  checkpoints.
- A conversation archived before a provider migration keeps its messages, but its native
  session reference may no longer resolve. It reopens read-only in practice until the
  provider creates a new native session.

## Migrating the early `dsh` provider

Version 1.5.0 removes the fork's own `dsh` provider in favour of upstream Claudian's
`deepseek` provider, which drives the same DeepSeek Harness CLI.

On first launch the plugin rewrites:

- `providerConfigs.dsh` → `providerConfigs.deepseek` (CLI path, environment, selected
  models re-encoded from `dsh:["route","model"]` to `deepseek:route/model`);
- `settingsProvider`, `lastSelectedChatModel`, saved model/effort/permission maps;
- persisted conversations with `providerId: "dsh"`, preserving `sessionId` and replacing
  the legacy state bag with the DeepSeek native-store binding.

The migration is idempotent and does nothing once a `deepseek` configuration exists.
