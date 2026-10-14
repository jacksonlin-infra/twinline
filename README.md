# Twinline

**English** · [简体中文](README.zh-CN.md)

Bilingual mode for Claude Code: write in your language, let Claude work in English, and read both side by side.

![Twinline in the terminal](docs/demo-terminal.gif)

Twinline is a Claude Code plugin (a mod). When it is on, what you type is translated into English before it is sent, so the model and the transcript only ever see English. Each of your messages shows your original with the English underneath, and each reply block gets a translation into your language once it has settled.

In the Desktop app's Code tab:

![Twinline in the Desktop app](docs/demo-desktop.gif)

Both demos: write in Chinese and read the English with a translation under each reply, switch to Traditional Chinese and Japanese with `/tl lang`, turn output translation off and on from the band, and switch Twinline off while the translated history stays.

## Install

Requires **Claude Code 2.1.292 or later** (CLI and the Desktop app's Code tab).

In a terminal session:

```
/plugin install twinline --marketplace jacksonlin-infra/twinline
```

Answer `y` to add the marketplace, then choose a scope (user scope loads it in every session, including the Desktop app's local sessions).

Twinline starts **on** in every new session, with a band above the prompt to switch it off and on (or `/twinline off`). To start sessions off, set `default_enabled` to `false`.

The install screen lets you set every option. Text and number fields show blank there, but each one's default is in its name and help line, and a blank field uses that default when you choose **Save configuration**, so you can save the screen as is. Change options later with `/plugin` → **Installed** → **twinline** → **Configure options**. Step-by-step install, configuration, languages, backends and troubleshooting: **[Guide](docs/GUIDE.md)**.

## Commands

| Command | Effect |
|---|---|
| `/twinline` | Show the session's state |
| `/twinline on` / `off` | Turn Twinline on or off for this session |
| `/twinline input on` / `off` | Translate what you type (alias: `in`) |
| `/twinline output on` / `off` | Translate Claude's replies (alias: `out`) |
| `/twinline lang <code>` | Your language, e.g. `zh-CN`, `ja`, `de` |
| `/twinline model <name>` | Translation model, e.g. `haiku`, `sonnet` |
| `/twinline status` | State plus counters: translations, failures, cache hits, store size |
| `/twinline help` | Help |

`/tl` is an alias of `/twinline`. While Twinline is on, a band above the prompt shows its state with **Off**, **in** and **out** buttons (in the terminal, focus the band with Ctrl+X Tab and press `t`, `i` or `o`; in the Desktop app, click).

Session settings survive `/clear`, `/resume` and `/branch`. Messages that were translated keep their translations after you turn Twinline off.

## Languages

Set your language once (`language` option) or per session with `/tl lang <code>`. Any language works; Traditional Chinese (`zh-TW`, `zh-HK`) and Japanese (`ja`) replies get tuned script and style rules. Translations you already have keep their language when you switch. Details: [Guide §6](docs/GUIDE.md#6-languages).

## Configuration

Global defaults live in the plugin's options (`/config` in a session, or the install screen).

| Option | Default | Meaning |
|---|---|---|
| `default_enabled` | `true` | Start every new session with Twinline on |
| `language` | `zh-CN` | BCP-47 code of the language you write and read in. `zh-TW`/`zh-HK` get Traditional characters with Taiwan/Hong Kong terminology; `ja` gets polite form with katakana terms |
| `translate_input` | `true` | Translate what you type into English |
| `translate_output` | `true` | Show a translation under each reply block |
| `model` | `haiku` | Model alias or id used for translation through your Claude Code sign-in |
| `glossary` | — | Terms as `source=target`, e.g. `工作区=workspace` (applied both ways) |
| `always_translate_input` | `false` | Also translate input written only in ASCII letters (for languages in Latin script) |
| `show_band_when_off` | `true` | Keep the band above the prompt while Twinline is off |
| `input_timeout_ms` | `8000` | Give up translating a prompt after this long and send it as typed |
| `settle_ms` | `1200` | How long a reply block must stay unchanged before it is translated |
| `backend` | `claude` | Where translations are computed: `claude`, `openai`, `deepl`, `ollama` |
| `backend_url` | — | Base URL for `openai`/`ollama` (e.g. `http://localhost:11434/v1`) or the DeepL host |
| `backend_model` | — | Model name for `openai`/`ollama` |
| `backend_key` | — | API key for the external backend (stored in secure storage) |

Twinline relies on the model answering in English. If Claude Code's own `language` setting makes it answer in your language instead, the replies are no longer translated; leave that setting unset while Twinline is on.

## Where it works

| Surface | Your messages | Replies | Band |
|---|---|---|---|
| Terminal (CLI) | Original + dim English line | Translation in a quoted block under each reply block | ✓ |
| Desktop app, Code tab | Original in the bubble + dim English line | Translation in a box under each reply block | ✓ |
| VS Code extension, mobile | Translated before sending | Not drawn | — |

Not translated: slash commands, `!` shell escapes, input that is already English (unless `always_translate_input`), code blocks, inline code, URLs, `@` references, file paths, identifiers such as `fetchUser` or `MAX_SIZE`, and `[Image #N]` markers.

Known limitations:

- In the Desktop app, text Claude writes between two tool calls is not offered to plugins, so it gets no translation.
- In the Desktop app, sending `/twinline` or `/tl` shows `/twinline isn't a command here.` above the prompt: the app does not treat commands that plugins register at run time as its own. The command still runs (its output and the band update as usual). The band's buttons switch Twinline without a command.
- Replies are translated while a turn is live. History drawn again later (after `/resume`, reopening a Desktop session, scrolling) shows saved translations but does not start new ones.
- A URL directly followed by punctuation without a space can take that punctuation with it.

## How it works

```
you type ──▶ prompt.submit ──▶ translate to English ──▶ the model sees English only
                                   │
                                   └─ your original is kept in Twinline's own store
transcript ──▶ ui.render UserMessage      ──▶ your original + "EN · …"
reply      ──▶ ui.render AssistantMessage ──▶ engine's block + translation once it settles
```

Translations go through Claude Code's mods API (`$.model.complete`, `haiku` by default) with your existing sign-in. Code, URLs, paths and identifiers are swapped for placeholders before translation and must come back exactly once, or the translation is dropped. Every failure falls back to the original: a prompt that cannot be translated in time is sent as typed, and a reply that cannot be translated is shown without a translation. Translations are cached across sessions.

## Privacy

```
Twinline sends the text you type (minus protected code, paths and URLs) and
Claude's replies to a translation model. By default that model is Claude,
called through Claude Code's official mods API with your existing sign-in,
so nothing leaves the channel your session already uses.

If you configure an external backend (OpenAI-compatible, DeepL or Ollama),
that text is sent to the endpoint you configured, and only then.

Twinline stores your original messages and cached translations in
~/.claude/plugins/store/ on your machine. It collects no analytics and
makes no network requests other than translation.
```

With an external backend configured, Twinline says where translations go at the start of every session.

## Development

```
claude plugin validate --strict .   # manifest and module scan
claude plugin test .                 # tests, terminal and desktop surfaces
tsc -p .                             # after one `claude --plugin-dir .` session lays the types
claude --plugin-dir .                # run it from a checkout
```

For the Desktop app, add the checkout's absolute path to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` and start a new Code session. `npm run check` runs all three checks.

## Documentation

| Document | For |
|---|---|
| [Guide](docs/GUIDE.md) · [使用指南](docs/GUIDE.zh-CN.md) | Install, configure, languages, glossary, backends, update, troubleshooting, FAQ |
| [Changelog](CHANGELOG.md) | What changed in each version |
| [Contributing](CONTRIBUTING.md) | Reporting bugs, sending changes, checking a build |
| [Security](SECURITY.md) | Reporting a vulnerability privately |

## License

[MIT](LICENSE) © 2026 Jacksonlin

Twinline is an independent project, not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.
