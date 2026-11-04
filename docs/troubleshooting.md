# Troubleshooting

The sections below name OMP where an example helps; the same steps apply to DeepSeek
Harness unless a section says otherwise.

## Provider CLI not found

If Claudian cannot auto-detect a provider CLI, verify that the CLI is installed and
available through PATH. Typical errors include `spawn omp ENOENT`, and DeepSeek Harness
reports that it "was not found".

On macOS and Linux, Obsidian launched from the Dock or a desktop entry does not inherit your
terminal's PATH, so Claudian reads PATH once from your login shell (`$SHELL -i -l`). CLIs and
Node.js installed through version managers such as nvm, fnm, Volta, asdf, or mise are found
the same way your terminal finds them. Reload Claudian after changing your shell profile. If
your profile is slow or interactive, skip that part when `CLAUDIAN_RESOLVING_ENVIRONMENT` is
set; Claudian falls back to common install locations if the shell does not answer within 10
seconds.

On Windows, Obsidian uses the PATH from your user and system environment variables. Restart
Obsidian after changing them.

Leave the CLI path empty at first so Claudian can auto-detect it. If auto-detection fails,
find the executable path, open **Settings → Claudian → Providers**, open the provider's tab
and expand its installation card, then set **CLI path**.

- **OMP** ships as a native binary named `omp`. Find it with `which omp` on macOS/Linux or
  `where.exe omp` on Windows.
- **DeepSeek Harness** auto-detects `dsh` first, then the DeepSeek Harness desktop app on
  macOS (`/Applications/DeepSeek Harness.app`) and Windows
  (`%LOCALAPPDATA%\Programs\DeepSeek Harness`). To use the desktop app when both are
  installed, enter its path in **CLI path**.

**Alternative**: Add your Node.js bin directory to PATH in Settings → Claudian → General →
Environment → Shared environment.

## A newly released model is missing

Claudian discovers models from each configured provider rather than keeping its own
hard-coded model list. A model can therefore be available through a provider or announced
publicly before it appears in the catalog returned for your provider installation,
configuration, and account.

1. Update the provider CLI or application, when applicable, and confirm the model appears there.
2. In Settings → Claudian → Providers, open the provider and confirm its CLI path,
   environment, and other connection settings use the same installation and account.
3. Under **Models**, open **Browse models**, then click **Refresh** if models are already
   listed, or **Discover** otherwise, to request the current catalog.
4. Enable the new model and start a new chat if you want to use it. Existing chats keep their
   selected model.

If the model is still absent, the active provider runtime or account has not reported it to
Claudian. Public or API availability alone does not guarantee catalog availability for every
provider integration or account. Avoid editing Claudian's installed bundle to add the model
manually; those changes are unsupported and will be overwritten by updates.

## Node.js not found for an npm-installed CLI

DeepSeek Harness installed through npm is a Node.js CLI, so it needs Node.js. Claudian
prefers the Node.js next to the CLI, then the first one on PATH. If the CLI still reports
that Node.js is missing (for example `env: node: No such file or directory`), check where
your terminal finds it:

```bash
dirname "$(which node)"
```

Either:

1. Install the native binary or desktop app where one is offered (recommended).
2. Add that directory in Settings → Claudian → General → Environment → Shared environment: `PATH=/path/to/node/bin`.

## The DeepSeek balance cannot be read

The balance read in the DeepSeek Harness tab uses `DEEPSEEK_API_KEY` from that provider's
environment. If it says no key is configured, add the variable under Environment
(**DeepSeek Harness environment variables**) in the DeepSeek Harness tab. The CLI itself
signs in through its own Web or Desktop profile; the key is used for the balance read.

When asking for help, share the variable names involved rather than their secret values.

## More help

For provider installation and configuration, see [omp.sh](https://omp.sh) for OMP and the
[DeepSeek Harness repository](https://github.com/deepseek-ai/deepseek-harness) for DeepSeek
Harness. If you have a feature request or run into a bug, please
[submit a GitHub issue](https://github.com/serena-sheng/super-useful-claudian/issues).
