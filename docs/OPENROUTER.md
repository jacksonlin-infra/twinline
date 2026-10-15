# Using OpenRouter as Twinline's translation backend

[中文](OPENROUTER.zh-CN.md) · Back to the [Guide](GUIDE.md)

By default Twinline translates through Claude (`haiku`) with your Claude Code sign-in. To translate with a third-party model instead, for example Gemini, GPT or Qwen through [OpenRouter](https://openrouter.ai), use Twinline's `openai` backend: OpenRouter's API is compatible with OpenAI chat completions, so you only point the URL at OpenRouter.

These steps were tested on a working setup (Claude Code 2.1.296, Twinline 0.4.0). Changing model means changing only **Backend model**; see [Recommended models](#recommended-models). Other OpenAI-compatible services (DeepSeek, SiliconFlow, a self-hosted vLLM) follow the same steps with a different URL, model name and key.

## Before you start

- Twinline is installed and works with the default backend (see the [Guide](GUIDE.md) §2).
- You have an OpenRouter account with credit (unless you use a free model).
- You know the model ID you want, from <https://openrouter.ai/models>. IDs look like `vendor/model`, e.g. `google/gemini-3.1-flash-lite`. If you are not sure which, start with [Recommended models](#recommended-models).

> **Privacy:** once you switch, what you type and Claude's replies are sent to OpenRouter, which passes them to the model's provider. The default `claude` backend sends nothing outside Claude. Make sure this is acceptable for you and your organisation.

## Step 1: Create an OpenRouter API key

1. Sign in to OpenRouter and open the **Keys** page (<https://openrouter.ai/keys>).
2. Choose **Create Key** and give it a name (e.g. `twinline`); set a credit limit if you want one.
3. Copy the key (it starts with `sk-or-`). It is shown only once.

## Step 2: Set the backend, URL and model

These three options are in `/config`. In a Claude Code terminal, type `/config`, open the **Config** tab and type `back` in the search box. Three options appear:

| Option | Value |
|---|---|
| **Backend · twinline** | `openai` |
| **Backend URL · twinline** | `https://openrouter.ai/api/v1` |
| **Backend model · twinline** | Your model ID, e.g. `google/gemini-3.1-flash-lite` |

Note:

- Stop the URL at `/api/v1`. Do **not** add `/chat/completions`; Twinline appends it.
- Choose `openai` as the backend, not `ollama` or `deepl`.

You can also put them in `~/.claude/settings.json`, with the same effect:

```json
"pluginConfigs": {
  "twinline@twinline": {
    "options": {
      "backend": "openai",
      "backend_url": "https://openrouter.ai/api/v1",
      "backend_model": "google/gemini-3.1-flash-lite"
    }
  }
}
```

## Step 3: Enter the API key (it is not in `/config`)

The API key is a sensitive option: **`/config` does not show it**, and it does not belong in `settings.json`. Enter it in the plugin menu, which keeps it in your system's secure storage:

1. Press Esc to leave `/config`, then type `/plugin`.
2. Choose **Installed** → **twinline** → **Configure options**.
3. Find **Backend API key** and paste the key from step 1.
4. Choose **Save configuration**.

(In Claude Code 2.1.296, `claude plugin configure twinline@twinline` reports that the plugin cannot be found; use the menu above.)

## Step 4: Check that it works

Start a new session (in the Desktop app, a new Code session) and check:

1. The session opens with `Twinline: translations will be sent to openrouter.ai`. It appears once per session as a reminder of where your text goes.
2. `/tl status` shows `backend openai openrouter.ai · model google/gemini-3.1-flash-lite`.
3. Send a message in your language: an `EN · …` line appears under it, and a translation appears under Claude's reply.
4. The requests appear on OpenRouter's **Activity** page.

When all four hold, you are set up.

## Troubleshooting

A failed translation never blocks you: your message is sent as typed, the reply shows only the original, and you see `Twinline: translation failed (…)` once. To find the cause, start Claude Code with a debug log:

```bash
claude --debug-file ./twinline.log
```

Reproduce the problem, then search `twinline.log` for `twinline`:

| In the log | Cause | Fix |
|---|---|---|
| `backend_url is not set` | No URL | Back to step 2 |
| `backend_model is not set` | No model | Back to step 2 |
| `HTTP 401` | Key wrong, missing or deleted | Back to step 3 and paste the key again |
| `HTTP 402` | Out of OpenRouter credit | Add credit, or use a free model |
| `HTTP 400` / `HTTP 404` | Wrong model ID, or `/chat/completions` added to the URL | Check the ID on openrouter.ai/models and the URL |
| `HTTP 429` | Rate limited (common on free models) | Try again later, or use a paid model |
| `timeout after … ms` | The model is too slow | Use a faster model, or raise `input_timeout_ms` |

The log records only the HTTP status, never the response body, so your key does not end up in it.

If the `translations will be sent to …` notice from step 4 does not appear, the backend is still `claude`: check that Backend was saved as `openai`, and that you started a new session.

## Recommended models

Prices are OpenRouter's USD per million tokens (checked 2026-10-15; they change, so see <https://openrouter.ai/models>). A translation is about as long as its source, so output is a large share of the tokens and the output price drives the total cost. Each model below was run through Twinline's actual request on 2026-10-15, Chinese to English and back, with code, file paths and Markdown in the text.

| Model ID | Input | Output | Why |
|---|---|---|---|
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | Passed every test run and was the fastest (about 1.3 s). A newer Gemini, cheaper than Gemini 2.5 Flash (0.30 / 2.50). Used as the example in this guide. |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | The best balance of quality and price. Good with technical text, and tends to leave code, file paths and Markdown untouched, which matters for Claude Code messages. |
| `deepseek/deepseek-v4.1-flash` | 0.014 | 0.89 | Works and is fast; one short message in six came back cut off in the test, and Twinline then sent it as typed. |

If you want Claude Haiku, you do not need OpenRouter: Twinline's default `claude` backend already calls `haiku` through your Claude Code sign-in, with no separate OpenRouter bill.

## Choosing a model

- **Fast:** your input must be translated within `input_timeout_ms` (default 8000 ms) or it is sent as typed, and each request waits at most 15 seconds. The models above are all quick flash / lite models.
- **Avoid reasoning models:** a model that thinks before answering spends Twinline's output budget (`max_tokens`, about twice the length of the text) on hidden reasoning, so the translation comes back empty or cut off and Twinline falls back to the original text. In the 2026-10-15 test `qwen/qwen3.7-flash` and `deepseek/deepseek-v4-flash` did this on most requests, so they are not recommended. Thinking models also tend to time out, and translation does not need them.
- **The glossary still applies:** the `openai` backend puts your `glossary` in the prompt (only the DeepL backend ignores it).
- **To change model,** change only **Backend model**; the key and URL stay.

## Switching back to Claude

Set **Backend** back to `claude` (it is in `/config`). The key stays in secure storage, unused. To remove it, clear **Backend API key** in **Configure options**, or delete the key on OpenRouter's Keys page.
