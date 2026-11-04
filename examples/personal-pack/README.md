# Example personal pack

Copy this folder to `.super-useful-claudian/personal/` inside your vault, then edit it. See
[docs/personal-pack.md](../../docs/personal-pack.md) for how each file is loaded and for the
symlink commands that hand the provider-native parts to the CLIs.

| Path | Purpose |
|---|---|
| `identity.md` | Text appended to every chat's system prompt as `## Personal Instructions`. |
| `commands/` | Prompt templates for the agent CLIs; link the folder where each CLI looks. |
| `skills/` | Skill packages for the Skills panel; link the folder to `.agents/skills`. |
| `mcp.json.example` | Project MCP configuration; copy it to `.mcp.json` in the vault root. |

Nothing here is read by the plugin except `identity.md`. Deleting the folder removes every
personal instruction from the next turn.
