# Changelog

All notable changes to Twinline are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- A step-by-step guide for translating through OpenRouter (or any OpenAI-compatible API) with the `openai` backend, with recommended models: [English](docs/OPENROUTER.md) · [中文](docs/OPENROUTER.zh-CN.md).
- A star-history chart at the end of the README.

## [0.4.0] - 2026-10-14

### Changed
- Twinline now starts **on** in every new session (`default_enabled` defaults to `true`), so it works right after installing with nothing to configure.
- The band above the prompt stays visible while Twinline is off (`show_band_when_off` defaults to `true`), showing `Twinline OFF` with an **On** button instead of disappearing.
- The install screen shows text and number fields blank even when they have defaults. Their names now carry the default (`Your language (default zh-CN)`, `Translation model (default haiku)`, `Input timeout, ms (default 8000)`, `Reply settle time, ms (default 1200)`), every option's help line ends with its default, and the README and guide say that a blank field uses its default, so the screen can be saved as is.

To keep the 0.3 behaviour, set `default_enabled` and `show_band_when_off` to `false` in `/config` or `/plugin` → **Installed** → **twinline** → **Configure options**.

## [0.3.0] - 2026-10-14

First public release. 0.1.0 and 0.2.0 were not published; their notes are kept below.

### Added
- README in English and Simplified Chinese, marketplace file, MIT license, CI.
- User guide in English and Simplified Chinese (install, configure, languages, glossary, backends, update, troubleshooting, FAQ) and a manual test checklist for the terminal and the Desktop app.
- Reply translations into Traditional Chinese (`zh-TW`, `zh-HK`, `zh-Hant`) and Japanese (`ja`) carry script and register rules: Traditional characters only with Taiwan or Hong Kong terminology and full-width punctuation; polite form with katakana terms. Measured with Haiku: without the rule 3 of 8 Traditional Chinese samples slipped into Simplified characters, mainland terms or half-width punctuation; with it 10 of 10 were correct.
- `languageName` reads the script subtag and knows `zh-MO`, so `zh-Hant-TW` and `zh-MO` show as 繁體中文; DeepL gets `ZH-HANT` for the same codes.
- The translation cache key includes the instruction text, so a prompt change stops serving translations made with the old prompt.
- README notes that Claude Code's own `language` setting must stay unset while Twinline is on.

## 0.2.0 - 2026-10-13

### Added
- Code blocks, inline code, URLs, `@` references, paths, identifiers, `[Image #N]` markers and paste wrappers are kept out of translation and must come back exactly once.
- Glossary (`source=target`), applied in both directions.
- Translation cache shared across sessions (least recently used first out, 600 entries / 512 KiB).
- External translation backends: OpenAI-compatible, Ollama and DeepL, with a notice of where text goes at the start of each session.
- `/twinline status` counters: translations, failures, prompt cache reads, cache hits, store size.

### Fixed
- Pasted text no longer shows its wrapper tags in the English line.
- Reply translations no longer show the model correcting itself ("Wait, correcting that…") or slip into commenting on replies that mention languages or Twinline: the model now returns the translation in a `<translation>` block, Twinline keeps the last one, and a reply that still corrects itself is dropped.
- Replies whose translation equals the original no longer show a duplicate box.

## 0.1.0 - 2026-10-13

### Added
- Input translation into English through `prompt.submit`, with a timeout and fail-open fallback to the text as typed.
- Side-by-side display of your messages (original + English) in the terminal and the Desktop app's Code tab.
- Translations of reply blocks once they settle, only for live turns.
- `/twinline` (`/tl`) commands, a band above the prompt with one-key toggles, and session settings that survive `/clear`, `/resume` and `/branch`.

[Unreleased]: https://github.com/jacksonlin-infra/twinline/compare/twinline--v0.4.0...HEAD
[0.4.0]: https://github.com/jacksonlin-infra/twinline/releases/tag/twinline--v0.4.0
[0.3.0]: https://github.com/jacksonlin-infra/twinline/releases/tag/twinline--v0.3.0
