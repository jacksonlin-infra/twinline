# Twinline guide

**English** · [简体中文](GUIDE.zh-CN.md) · back to [README](../README.md)

Everything about installing, configuring and using Twinline. For a one-page overview, read the README.

- [1. Requirements](#1-requirements)
- [2. Install](#2-install)
- [3. Configure](#3-configure)
- [4. First run](#4-first-run)
- [5. Everyday use](#5-everyday-use)
- [6. Languages](#6-languages)
- [7. Glossary](#7-glossary)
- [8. External translation backends](#8-external-translation-backends)
- [9. Update and uninstall](#9-update-and-uninstall)
- [10. Troubleshooting](#10-troubleshooting)
- [11. FAQ](#11-faq)

## 1. Requirements

- **Claude Code 2.1.292 or later.** Check with `claude --version` in a terminal, or `/status` in a Desktop Code session.
- Signed in to Claude Code. With the default backend, translations use your existing sign-in; nothing else is needed.
- **Claude Code's own `language` setting left unset** (see [§6](#claude-codes-own-language-setting)).

## 2. Install

Installing is done from a **terminal** session; the Desktop app's Code tab does not offer `/plugin install`, but it loads what you install there.

1. Start `claude` in a terminal and enter:

   ```
   /plugin install twinline --marketplace jacksonlin-infra/twinline
   ```

2. Answer `y` to add the marketplace (only asked the first time).
3. Choose a scope:

   | Scope | Loads in |
   |---|---|
   | **Install for you (user scope)** — recommended | every session of yours, including the Desktop app's local Code sessions |
   | Install for all collaborators on this repository (project scope) | everyone who opens this project |
   | Install for you, in this repo only (local scope) | your sessions in this project |

4. The **Configure Twinline** screen lists every option (§3). Change what you need, then choose **Save configuration**; or press Esc to install with the defaults and configure later.
5. You see `✓ Installed Twinline. Plugin is now active.` Type `/plugin` and check that the mods line reads `1 mod active · twinline` (or includes `twinline`).

Desktop: after installing at user scope, start a **new** Code session; existing sessions keep what they loaded. In the Desktop app, sending `/twinline` or `/tl` shows `/twinline isn't a command here.` above the prompt, because the app does not treat commands that plugins register at run time as its own; the command still runs. (In a brand-new session the commands also appear in the `/` menu only after the first message, when the app starts Claude Code.)

## 3. Configure

Options are global defaults; `/twinline` commands change the current session only (§5).

| Way | Reaches | How |
|---|---|---|
| Install screen | all options | shown once while installing |
| **Plugin menu** — recommended | all options, including `glossary` and `backend_key` | `/plugin` → **Installed** → **twinline** → **Configure options** (terminal) |
| `/config` | single-value, non-secret options (`glossary` and `backend_key` are not listed) | type `twinline` in the search box |
| `~/.claude/settings.json` | all but `backend_key` | `"pluginConfigs": { "twinline@twinline": { "options": { … } } }` |

Example `settings.json` block:

```json
"pluginConfigs": {
  "twinline@twinline": {
    "options": {
      "language": "ja",
      "glossary": ["工作区=workspace", "提交=commit"],
      "default_enabled": true
    }
  }
}
```

`backend_key` is stored in your system's secure storage, so set it through the install screen or **Configure options**, never in a file. (In Claude Code 2.1.296, `claude plugin configure twinline@twinline` answers that no such plugin is installed; use the plugin menu instead.)

All options:

| Option | Default | Meaning |
|---|---|---|
| `default_enabled` | `false` | Start every new session with Twinline on |
| `language` | `zh-CN` | BCP-47 code of the language you write and read in (§6) |
| `translate_input` | `true` | Translate what you type into English |
| `translate_output` | `true` | Show a translation under each reply block |
| `model` | `haiku` | Model alias or id used for translation through your sign-in |
| `glossary` | — | Terms as `source=target` (§7) |
| `always_translate_input` | `false` | Also translate input written only in ASCII letters |
| `show_band_when_off` | `false` | Keep the band above the prompt while Twinline is off |
| `input_timeout_ms` | `8000` | Give up translating a prompt after this long and send it as typed (1000–30000) |
| `settle_ms` | `1200` | How long a reply block must stay unchanged before it is translated (300–5000) |
| `backend` | `claude` | `claude`, `openai`, `deepl`, `ollama` (§8) |
| `backend_url` | — | Base URL for `openai`/`ollama`, or a DeepL host |
| `backend_model` | — | Model name for `openai`/`ollama` |
| `backend_key` | — | API key for the external backend (secure storage) |

Changing an option reloads Twinline; the change applies right away.

## 4. First run

1. In any project, start a session and enter `/twinline on`. You see `Twinline ON · 中文→EN · input ✓ output ✓ · model haiku`, and a band above the prompt.
2. Type in your language, for example `帮我看看这个仓库的测试为什么失败`.
3. Your message shows what you typed, with a dim `EN · …` line under it: that English is what Claude received.
4. Claude answers in English. A second or two after each reply block stops changing, a translation appears under it (a quoted block in the terminal, a box in the Desktop app); while it is on its way you see `⇄ translating…`.

## 5. Everyday use

| Command | Effect (this session) |
|---|---|
| `/twinline` or `/tl` | Show the state |
| `/twinline on` / `off` | Switch Twinline on or off |
| `/twinline input on` / `off` (or `in`) | Translate what you type, or send it as typed |
| `/twinline output on` / `off` (or `out`) | Translate replies, or leave them in English |
| `/twinline lang <code>` | Change your language, e.g. `/tl lang ja` |
| `/twinline model <name>` | Change the translation model, e.g. `/tl model sonnet` |
| `/twinline status` | State plus counters: translations, failures, cache hits, store size |
| `/twinline help` | Help |

**The band** (shown while on): `Twinline ON · 中文→EN  Off  in ✓  out ✓`. In the terminal, press Ctrl+X Tab to focus it, then `t` (on/off), `i` (input) or `o` (output). In the Desktop app, click the buttons. On a narrow prompt it shrinks to `TL ON`.

**What stays:** session settings survive `/clear`, `/resume` and `/branch`. Translations you already have stay visible after you switch Twinline off and after a resume. Replies are translated while a turn is live; history drawn again later shows saved translations but starts no new ones.

**What is never translated:** slash commands, `!` shell escapes, input that is already English (unless `always_translate_input`), code blocks, inline code, URLs, `@` references, file paths, identifiers such as `fetchUser` or `MAX_SIZE`, `[Image #N]` markers and pasted-text wrappers. If the translation loses or repeats any of these, Twinline drops the translation and sends your text as typed.

## 6. Languages

Set your language once in the options (`language`), or per session with `/tl lang <code>`. The band shows the language's own name.

| Code | Shown as | Reply translations |
|---|---|---|
| `zh-CN` (default), `zh`, `zh-Hans` | 中文 | Simplified Chinese |
| `zh-TW`, `zh-Hant`, `zh-Hant-TW` | 繁體中文 | Traditional characters only, Taiwan terminology (程式, 檔案, 伺服器, 資料庫, 執行緒, 快取, 預設…), full-width punctuation |
| `zh-HK`, `zh-MO` | 繁體中文 | Traditional characters only, Hong Kong terminology, full-width punctuation |
| `ja` | 日本語 | Polite です・ます form; technical terms in katakana (サーバー, キャッシュ, デプロイ…) |
| any other code (`ko`, `de`, `fr`, `es`, …) | its own name, or the code | Plain translation, no extra style rules |

An explicit `Hans` script wins over a region (`zh-Hans-HK` is Simplified).

**Languages written in Latin letters** (German, French, Spanish, …): Twinline treats input made only of ASCII letters as English and sends it untouched. Turn on `always_translate_input` if you write such text in your language. Accented letters (ä, é, ñ) already count as non-English.

### Claude Code's own `language` setting

Twinline relies on Claude answering in English. If Claude Code's own `language` setting asks Claude to answer in your language, replies arrive already translated and Twinline has nothing to do. Leave that setting unset while you use Twinline (`/config`, search `language`).

## 7. Glossary

Entries are `source=target`, written from your language to English: `工作区=workspace`. Twinline uses them both ways: 工作区 becomes *workspace* in what you send, and *workspace* becomes 工作区 in reply translations. Entries without exactly one `=` are ignored. Set the glossary through **Configure options** or `settings.json` (§3); `/config` does not list it. The DeepL backend does not apply the glossary.

## 8. External translation backends

By default translations go through Claude with your sign-in. You can send them elsewhere instead; Twinline then shows `Twinline: translations will be sent to <host>` at the start of every session.

| Backend | Options |
|---|---|
| OpenAI-compatible | `backend: openai`, `backend_url` (default `https://api.openai.com/v1`), `backend_model`, `backend_key` |
| Ollama (local) | `backend: ollama`, `backend_url` (default `http://localhost:11434/v1`), `backend_model` (e.g. `qwen2.5`), no key |
| DeepL | `backend: deepl`, `backend_key` (keys ending in `:fx` use the free API automatically); `backend_url` only for a custom host |

Each request waits at most 15 seconds. `/twinline status` shows the backend and host.

## 9. Update and uninstall

- **Update:** `/plugin` → **Installed** → **twinline** → **Update now**, or `claude plugin update twinline@twinline` in a shell; then restart Claude Code (or start a new session).
- **Uninstall:** `/plugin` → **Installed** → **twinline** → **Uninstall**, or `claude plugin uninstall twinline@twinline`.
- **Your data:** original messages and cached translations live in `~/.claude/plugins/store/twinline_twinline-*.json`. Uninstalling leaves the file; delete it (with Claude Code closed) to remove everything Twinline stored.

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| No band above the prompt | Twinline starts off: `/twinline on`. To see the band while off, set `show_band_when_off`. |
| No `EN · …` line under my message | The text looked English (Latin letters only; see §6), started with `/` or `!`, or input translation is off (`/tl`). |
| `Twinline: translation failed (api-error), sent as typed` | Your sign-in may have expired (run `/login`), or your organization blocks the model (try `/tl model sonnet`). Twinline shows this once per session. |
| `… translation failed (timeout) …` | The model took longer than `input_timeout_ms`; raise it, or try again. |
| Replies have no translation | Output translation off (`/tl`); Claude answered in your language (Claude Code's own `language` setting, §6); the reply is history redrawn after a resume; in the Desktop app, text between two tool calls is not offered to plugins. |
| A reply translation looks wrong | `/twinline status` shows failures; translations are cached across sessions, so a fixed glossary or language applies to new text. |
| Desktop: `/twinline isn't a command here.` | Expected in the Desktop app (see §2): the command still ran; check its output line and the band. Use the band's buttons to switch without commands, and `default_enabled` to start sessions with Twinline on. |
| Twinline does nothing at all | `/plugin` should list `twinline` among active mods. Run `claude --debug-file ./twinline.log`, reproduce, and look for lines containing `twinline` (a `hook skipped` or `refused` line says why). |
| Two copies seem loaded | A development checkout in `CLAUDE_CODE_PLUGIN_DIRS` or `--plugin-dir` replaces the installed copy of the same name. |

## 11. FAQ

**Does Twinline send my text anywhere else?** Not by default: translations go through Claude Code's mods API with your sign-in. Only a backend you configure (§8) receives text, and Twinline tells you so every session. See Privacy in the README.

**What does it cost?** Each translation is one small model call (Haiku by default) on your Claude plan: one per prompt, one per reply block. Repeated text is served from the cache.

**Does the model ever see my original text?** No. Claude and the transcript see only the English. Your original is kept in Twinline's own store, on your machine.

**Can I use it in VS Code or on mobile?** Input is translated there too, but those surfaces do not draw the side-by-side rows or the band.
