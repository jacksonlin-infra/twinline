# Contributing to Twinline

Thanks for helping. Bug reports, translation-quality reports for your language, and small focused pull requests are all welcome.

## Reporting a bug

Open an issue with:

- `claude --version` (terminal) or `/status` (Desktop app), and which of the two you used;
- your `language` option and backend (`/tl status` shows both);
- what you typed, what you expected, and what you saw (a screenshot helps for display problems).

For translation quality, include the original text and the translation you got. Please do not paste anything private: the issue is public.

Security problems go through [SECURITY.md](SECURITY.md), not issues.

## Setting up

You need Claude Code ≥ 2.1.292 and Node 20 for `tsc`.

```
npm install                          # TypeScript only; Twinline has no runtime dependencies
claude --plugin-dir .                # one session lays the engine types used by tsc
npm run check                        # validate --strict, tests, tsc
```

For the Desktop app, add the checkout's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` and start a new Code session.

## Sending a change

1. Open an issue first for anything larger than a fix, so we can agree on the approach.
2. Keep the pull request to one change. Add or update tests in `tests/`; UI tests run on both the `terminal` and `desktop` surfaces.
3. `npm run check` passes.
4. Check the change by hand in **both** the terminal and the Desktop app (see below).
5. Add a line under `[Unreleased]` in `CHANGELOG.md`.

Ground rules the code keeps:

- No runtime dependencies, no telemetry, and no text sent anywhere except through Claude Code's mods API or a backend the user configured.
- Fail open: if a translation fails or times out, the prompt goes out as typed and the reply shows without a translation.
- Nothing is translated or stored while Twinline is off.
- `hooks/register.tsx` only wires hooks together; logic lives in `hooks/lib/`.

## Checking a build by hand

Automated tests cover the logic; the real display and real translations need a look. In a terminal session and in a Desktop Code session, with Claude Code's own `language` setting unset:

1. `/twinline on`: the band appears above the prompt.
2. Send a prompt in your language that makes Claude use a tool: your line shows the original with a grey `EN · …` line under it, and each reply block gets a translation.
3. Send a prompt with a code block, a URL, an `@file` reference and an identifier: they come through unchanged in the `EN` line.
4. Switch output translation off and on from the band, then switch Twinline off: new replies are not translated, earlier translations stay.
5. `/clear`, then resume the session: the band and language are kept, history keeps its translations, and nothing is translated again.
6. `/tl status`: `failed` is 0.

Mention in the pull request which of these you ran, and where.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
