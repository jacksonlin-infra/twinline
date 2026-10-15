# 用 OpenRouter 做 Twinline 的翻译后端

[English](OPENROUTER.md) · 返回 [使用指南](GUIDE.zh-CN.md)

Twinline 默认用你的 Claude Code 登录、经 Claude（`haiku`）翻译。如果想让翻译走第三方模型，比如通过 [OpenRouter](https://openrouter.ai) 调用 Gemini、GPT、Qwen 等，可以用 Twinline 的 `openai` 后端：OpenRouter 的接口与 OpenAI 的 chat completions 兼容，只要把地址指向 OpenRouter。

本文的配置步骤经实测成功（Claude Code 2.1.296、Twinline 0.4.0）；换模型只需改 **Backend model** 一项，推荐的模型见 [推荐模型](#推荐模型)。其他 OpenAI 兼容服务（如 DeepSeek、硅基流动、自建 vLLM）的步骤相同，只是 URL、模型名和 key 不同。

## 开始之前

- 已安装 Twinline，并确认它在默认后端下能正常工作（见 [使用指南](GUIDE.zh-CN.md) §2）。
- 有一个 OpenRouter 账号，账户里有余额（免费模型除外）。
- 知道要用的模型 ID，在 <https://openrouter.ai/models> 查，格式是 `厂商/模型`，例如 `google/gemini-3.1-flash-lite`；不知道选哪个，先看 [推荐模型](#推荐模型)。

> **隐私提示：** 切换后，你输入的内容和 Claude 的回复会发送到 OpenRouter，再由 OpenRouter 转给模型厂商。默认的 `claude` 后端不会把内容发到 Claude 以外。请确认这符合你和你所在组织的要求。

## 第 1 步：创建 OpenRouter API key

1. 登录 OpenRouter，打开 **Keys** 页面（<https://openrouter.ai/keys>）。
2. 点 **Create Key**，起个名字（如 `twinline`）；需要的话设一个额度上限。
3. 复制生成的 key（以 `sk-or-` 开头）。它只显示一次。

## 第 2 步：设置后端、地址和模型

这三项在 `/config` 里就能改。在 Claude Code 终端里输入 `/config`，切到 **Config** 页，在搜索框里输入 `back`，会看到三项：

| 选项 | 填写 |
|---|---|
| **Backend · twinline** | `openai` |
| **Backend URL · twinline** | `https://openrouter.ai/api/v1` |
| **Backend model · twinline** | 你的模型 ID，如 `google/gemini-3.1-flash-lite` |

注意：

- URL 只写到 `/api/v1`，**不要**加 `/chat/completions`，Twinline 会自己拼上。
- Backend 选 `openai`，不是 `ollama` 或 `deepl`。

也可以写进 `~/.claude/settings.json`，效果相同：

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

## 第 3 步：填写 API key（`/config` 里没有这一项）

API key 是敏感项，**`/config` 里不显示**，`settings.json` 里也不要写。它只能在插件菜单里填，填好后会存进系统的安全存储：

1. 按 Esc 退出 `/config`，在终端里输入 `/plugin`。
2. 选 **Installed** → **twinline** → **Configure options**。
3. 找到 **Backend API key**，粘贴第 1 步复制的 key。
4. 选 **Save configuration**。

（Claude Code 2.1.296 里 `claude plugin configure twinline@twinline` 命令会报“找不到插件”，请用上面的菜单。）

## 第 4 步：确认生效

新开一个会话（Desktop 应用里新建一个 Code 会话），检查：

1. 会话开始时出现提示 `Twinline: translations will be sent to openrouter.ai`。每个会话都会提示一次，提醒你内容会发往哪里。
2. 输入 `/tl status`，状态行显示 `backend openai openrouter.ai · model google/gemini-3.1-flash-lite`。
3. 用中文发一条消息，消息下方出现 `EN · …` 的英文译文；Claude 回复后，下方出现中文译文。
4. 在 OpenRouter 的 **Activity** 页面能看到对应的请求记录。

四项都满足就配置完成了。

## 故障排查

翻译失败时 Twinline 不会卡住：你的消息按原样发送、回复只显示原文，并提示一次 `Twinline: translation failed (…)`。要看具体原因，在终端用调试日志启动：

```bash
claude --debug-file ./twinline.log
```

复现一次，然后在 `twinline.log` 里搜 `twinline`：

| 日志里看到 | 原因 | 处理 |
|---|---|---|
| `backend_url is not set` | 没填 URL | 回到第 2 步 |
| `backend_model is not set` | 没填模型 | 回到第 2 步 |
| `HTTP 401` | key 错误、没填，或已被删除 | 回到第 3 步重新粘贴 key |
| `HTTP 402` | OpenRouter 余额不足 | 去 OpenRouter 充值，或换免费模型 |
| `HTTP 400` / `HTTP 404` | 模型 ID 写错，或 URL 多了 `/chat/completions` | 对照 openrouter.ai/models 检查模型 ID 和 URL |
| `HTTP 429` | 触发限流（免费模型常见） | 稍后再试，或换付费模型 |
| `timeout after … ms` | 模型太慢 | 换更快的模型，或调大 `input_timeout_ms` |

日志里只记录 HTTP 状态码，不记录返回内容，所以 key 不会出现在日志里。

如果没出现第 4 步的 `translations will be sent to …` 提示，说明后端仍是 `claude`：检查 Backend 是否保存成了 `openai`，并确认新开了会话。

## 推荐模型

价格是 OpenRouter 上每百万 token 的美元价（2026-10-15 查询，会变动，以 <https://openrouter.ai/models> 为准）。翻译的译文长度和原文差不多，输出量不小，所以输出单价对总成本影响很大。下表每个模型都在 2026-10-15 按 Twinline 的实际请求实测过：中译英、英译中各若干次，文本里含代码、文件路径和 Markdown。

| 模型 ID | 输入 | 输出 | 推荐理由 |
|---|---|---|---|
| `google/gemini-3.1-flash-lite` | 0.25 | 1.50 | 实测全部通过，也最快（约 1.3 秒）。较新的 Gemini，比 Gemini 2.5 Flash（0.30 / 2.50）便宜。本文示例用它。 |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | 质量与价格最平衡。擅长技术文本，倾向于保留代码、文件路径和 Markdown 不动，这对 Claude Code 的消息很重要。 |
| `deepseek/deepseek-v4.1-flash` | 0.014 | 0.89 | 可以用，也快；实测 6 次中有 1 条短消息译文被截断，Twinline 随即按原文发送。 |

想用 Claude Haiku 的话，其实不必经过 OpenRouter：Twinline 默认的 `claude` 后端就是用你的 Claude Code 登录调用 `haiku`，不会另外按 OpenRouter 计费。

## 选模型的注意事项

- **要快：** 你输入的内容要在 `input_timeout_ms`（默认 8000 毫秒）内翻译完，否则按原样发送；每个请求最多等 15 秒。上表都是 flash / lite 一类的快速模型。
- **避开推理模型：** 先思考再回答的模型会把 Twinline 的输出额度（`max_tokens`，约为原文长度的两倍）花在看不见的推理上，译文因此为空或被截断，Twinline 只能退回原文。2026-10-15 实测中 `qwen/qwen3.7-flash` 和 `deepseek/deepseek-v4-flash` 大多数请求都是这样，所以不推荐。这类模型也容易超时，翻译用不到推理能力。
- **术语表照常生效：** `openai` 后端会把你的 `glossary` 带进提示词（只有 DeepL 后端不用术语表）。
- **换模型：** 只改 **Backend model**，key 和 URL 不用动。

## 切换回 Claude

把 **Backend** 改回 `claude` 即可（`/config` 里就能改）。key 会继续留在安全存储里但不再使用；不想保留的话，在 **Configure options** 里清空 **Backend API key**，或者直接在 OpenRouter 的 Keys 页面删除这个 key。
