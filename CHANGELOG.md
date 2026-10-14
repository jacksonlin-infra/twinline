# Changelog

All notable changes to Twinline are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/jacksonlin-infra/twinline/compare/twinline--v0.3.0...HEAD
[0.3.0]: https://github.com/jacksonlin-infra/twinline/releases/tag/twinline--v0.3.0
