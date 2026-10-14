# Security policy

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: **Security → Report a vulnerability** on this repository.

Include the Twinline and Claude Code versions, what an attacker can do, and the steps to reproduce. We aim to reply within a week. Once a fix is released, the advisory is published with credit to you unless you prefer otherwise.

## Supported versions

Only the latest release receives fixes.

## Scope

Twinline runs inside Claude Code and sends text only through Claude Code's mods API, or to an external translation backend that you configure (OpenAI-compatible, Ollama or DeepL). Of particular interest:

- text reaching a destination other than the one configured;
- the external backend API key leaking out of Claude Code's secure storage path;
- crafted model output or prompts that make Twinline change what is sent to the model beyond the translation.
