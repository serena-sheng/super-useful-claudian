# Attribution

This project is a fork of [Claudian](https://github.com/YishenTu/claudian) by
**Yishen Tu** (MIT licensed). The upstream project provides the plugin
architecture, the provider framework and the chat UI that this fork builds on.

This fork ships two providers:

- **DeepSeek Harness** (`deepseek`), kept from upstream Claudian.
- **OMP (Oh My Pi)** (`omp`), the default provider, written for this project.

The **OMP (Oh My Pi) provider** was written for this project from the shipped
`omp` binary and the upstream provider framework. The approach was informed by
[oh-my-claudian](https://github.com/lee259/oh-my-claudian) by **Lee** (also a
Claudian fork, MIT licensed), which independently added OMP support over an ACP
transport; only OMP-specific facts (binary name, npm package, env-var
isolation, approval-mode values) were taken from it, not its execution layer.

The additions made by this fork — provider readiness, the capability matrix,
the token meter, full local session restore, the DeepSeek balance read, the
composer features and the personal pack — are described in `README.md`.

Both upstream projects are MIT licensed. See `LICENSE`.

## Modifications in this fork

Copyright (c) 2026 Serena Sheng. The modifications in this repository are released under the
same MIT license as the upstream projects (see LICENSE).
