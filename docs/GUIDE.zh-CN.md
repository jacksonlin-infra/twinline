# Twinline 使用指南

[English](GUIDE.md) · **简体中文** · 返回 [README](../README.zh-CN.md)

安装、配置和使用 Twinline 的全部说明。只想快速了解，看 README 就够了。

- [1. 前提条件](#1-前提条件)
- [2. 安装](#2-安装)
- [3. 配置](#3-配置)
- [4. 第一次使用](#4-第一次使用)
- [5. 日常使用](#5-日常使用)
- [6. 语言](#6-语言)
- [7. 术语表](#7-术语表)
- [8. 外部翻译后端](#8-外部翻译后端)
- [9. 更新与卸载](#9-更新与卸载)
- [10. 故障排查](#10-故障排查)
- [11. 常见问题](#11-常见问题)

## 1. 前提条件

- **Claude Code 2.1.292 或更高版本。** 终端里用 `claude --version` 查看，Desktop 的 Code 会话里用 `/status` 查看。
- 已登录 Claude Code。默认后端用你现有的登录做翻译，不需要额外设置。
- **Claude Code 自身的 `language` 设置保持未设置**（见 [§6](#claude-code-自身的-language-设置)）。

## 2. 安装

安装要在**终端**会话里做。Desktop 应用的 Code 标签页没有 `/plugin install`，但会加载你在终端里装好的插件。

1. 在终端启动 `claude`，输入：

   ```
   /plugin install twinline --marketplace jacksonlin-infra/twinline
   ```

2. 提示添加 marketplace 时按 `y`（只有第一次会问）。
3. 选择作用域：

   | 作用域 | 在哪里加载 |
   |---|---|
   | **Install for you (user scope)**（推荐） | 你的所有会话，包括 Desktop 应用的本地 Code 会话 |
   | Install for all collaborators on this repository (project scope) | 打开这个项目的所有人 |
   | Install for you, in this repo only (local scope) | 你在这个项目里的会话 |

4. 接着出现 **Configure Twinline** 界面，列出全部选项（见 §3）。文本和数字项显示为空，但默认值写在名称里（如 *Your language (default zh-CN)*）和底部说明里，空白项会自动使用默认值。改好需要的项（不改也可以）后选 **Save configuration**；也可以直接按 Esc，用默认值完成安装，以后再配置。
5. 看到 `✓ Installed Twinline. Plugin is now active.` 即安装完成。输入 `/plugin`，确认 mod 一行显示 `1 mod active · twinline`（或包含 `twinline`）。

Desktop：在终端以 user 作用域安装后，新建一个 Code 会话。已经打开的会话不会重新加载。Desktop 应用里，发送 `/twinline` 或 `/tl` 后输入框上方会提示 `/twinline isn't a command here.`，因为 Desktop 不把插件运行时注册的命令当作自己的命令；命令照常执行。（全新会话里，这两个命令要在发出第一条消息、Desktop 启动 Claude Code 之后才出现在 `/` 菜单里。）

## 3. 配置

选项是全局默认值；`/twinline` 命令只改当前会话（见 §5）。

| 途径 | 能改哪些 | 怎么做 |
|---|---|---|
| 安装界面 | 全部选项 | 安装时出现一次 |
| **插件菜单**（推荐） | 全部选项，包括 `glossary` 和 `backend_key` | 终端里 `/plugin` → **Installed** → **twinline** → **Configure options** |
| `/config` | 单值、非密钥的选项（不显示 `glossary` 和 `backend_key`） | 搜索框里输入 `twinline` |
| `~/.claude/settings.json` | 除 `backend_key` 外的全部选项 | `"pluginConfigs": { "twinline@twinline": { "options": { … } } }` |

`settings.json` 写法示例：

```json
"pluginConfigs": {
  "twinline@twinline": {
    "options": {
      "language": "ja",
      "glossary": ["工作区=workspace", "提交=commit"],
      "default_enabled": false
    }
  }
}
```

`backend_key` 保存在系统的安全存储里，请通过安装界面或 **Configure options** 设置，不要写进任何文件。（Claude Code 2.1.296 里 `claude plugin configure twinline@twinline` 会提示找不到这个插件，请改用插件菜单。）

全部选项：

| 选项 | 默认值 | 含义 |
|---|---|---|
| `default_enabled` | `true` | 每个新会话都默认开启 |
| `language` | `zh-CN` | 你读写所用语言的 BCP-47 代码（见 §6） |
| `translate_input` | `true` | 把你输入的内容翻译成英文 |
| `translate_output` | `true` | 在每个回复块下显示译文 |
| `model` | `haiku` | 翻译所用模型的别名或 id，经你的登录调用 |
| `glossary` | — | 术语，写成 `原文=译文`（见 §7） |
| `always_translate_input` | `false` | 只含 ASCII 字母的输入也翻译 |
| `show_band_when_off` | `true` | 关闭时也保留输入框上方的状态条 |
| `input_timeout_ms` | `8000` | 输入翻译超过这么久就放弃，按原样发送（1000–30000） |
| `settle_ms` | `1200` | 回复块保持不变多久后才翻译（300–5000） |
| `backend` | `claude` | `claude`、`openai`、`deepl`、`ollama`（见 §8） |
| `backend_url` | — | `openai`/`ollama` 的基础 URL，或 DeepL 主机 |
| `backend_model` | — | `openai`/`ollama` 的模型名 |
| `backend_key` | — | 外部后端的 API key（安全存储） |

改动选项后 Twinline 会重新加载，立即生效。

## 4. 第一次使用

1. 在任意项目里开一个会话。Twinline 已经开启：输入框上方的状态条显示 `Twinline ON · 中文→EN`。（如果把 `default_enabled` 设成了 `false`，输入 `/twinline on` 或点状态条上的 **On** 按钮。）
2. 用你的语言输入，比如 `帮我看看这个仓库的测试为什么失败`。
3. 你的消息显示你输入的原文，下面一行灰色的 `EN · …` 就是 Claude 实际收到的英文。
4. Claude 用英文回答。每个回复块停止变化一两秒后，下方出现译文（终端里是带竖线的引用块，Desktop 里是一个框）；翻译进行中显示 `⇄ translating…`。

## 5. 日常使用

| 命令 | 作用（当前会话） |
|---|---|
| `/twinline` 或 `/tl` | 显示状态 |
| `/twinline on` / `off` | 开启或关闭 Twinline |
| `/twinline input on` / `off`（或 `in`） | 翻译你的输入，或按原样发送 |
| `/twinline output on` / `off`（或 `out`） | 翻译回复，或保留英文 |
| `/twinline lang <code>` | 换语言，如 `/tl lang ja` |
| `/twinline model <name>` | 换翻译模型，如 `/tl model sonnet` |
| `/twinline status` | 状态与计数：翻译次数、失败次数、缓存命中、存储大小 |
| `/twinline help` | 帮助 |

**状态条**（开启时显示）：`Twinline ON · 中文→EN  Off  in ✓  out ✓`。终端里按 Ctrl+X Tab 聚焦状态条，再按 `t`（开/关）、`i`（输入翻译）、`o`（输出翻译）。Desktop 里直接点击按钮。输入框很窄时缩成 `TL ON`。

**会保留什么：** 会话设置在 `/clear`、`/resume`、`/branch` 之后保留。关闭 Twinline 或恢复会话后，已有的译文仍然显示。只翻译进行中的回合里的回复；之后重新绘制的历史显示已保存的译文，但不会发起新的翻译。

**哪些内容永远不翻译：** 斜杠命令、`!` 开头的 shell 命令、本来就是英文的输入（除非开启 `always_translate_input`）、代码块、行内代码、URL、`@` 引用、文件路径、`fetchUser`、`MAX_SIZE` 这类标识符、`[Image #N]` 标记和粘贴文本的包装标签。如果译文把这些内容弄丢或弄重复，Twinline 会放弃这次译文，按你输入的原样发送。

## 6. 语言

在选项里设一次 `language`，或在会话里用 `/tl lang <code>` 切换。状态条显示该语言的自称。

| 代码 | 显示为 | 回复译文 |
|---|---|---|
| `zh-CN`（默认）、`zh`、`zh-Hans` | 中文 | 简体中文 |
| `zh-TW`、`zh-Hant`、`zh-Hant-TW` | 繁體中文 | 只用繁體字，台灣用語（程式、檔案、伺服器、資料庫、執行緒、快取、預設…），全形標點 |
| `zh-HK`、`zh-MO` | 繁體中文 | 只用繁體字，香港用語，全形標點 |
| `ja` | 日本語 | です・ます体，技术词用片假名（サーバー、キャッシュ、デプロイ…） |
| 其他代码（`ko`、`de`、`fr`、`es` 等） | 该语言的自称，或代码本身 | 普通翻译，不加额外风格规则 |

显式写了 `Hans` 脚本时以它为准（`zh-Hans-HK` 是简体）。

**用拉丁字母书写的语言**（德语、法语、西班牙语等）：只含 ASCII 字母的输入会被当成英文，原样发送。如果你用这类语言写纯 ASCII 文本，请开启 `always_translate_input`。带变音符号的字母（ä、é、ñ）本身就会被识别为非英文。

### Claude Code 自身的 language 设置

Twinline 依赖 Claude 用英文回答。如果 Claude Code 自身的 `language` 设置要求 Claude 用你的语言回答，回复一到就已经是你的语言，Twinline 就没有东西可翻了。使用 Twinline 时请保持这个设置未设置（`/config` 里搜索 `language`）。

## 7. 术语表

每项写成 `原文=译文`，方向是从你的语言到英文：`工作区=workspace`。Twinline 双向使用：你发出的内容里"工作区"译为 *workspace*，回复译文里 *workspace* 译为"工作区"。不是恰好一个 `=` 的条目会被忽略。术语表通过 **Configure options** 或 `settings.json` 设置（见 §3），`/config` 里不显示。DeepL 后端不使用术语表。

## 8. 外部翻译后端

默认翻译经 Claude 用你的登录完成。你也可以改用其他后端；这时每个会话开始都会提示 `Twinline: translations will be sent to <host>`。

| 后端 | 选项 |
|---|---|
| OpenAI 兼容 | `backend: openai`、`backend_url`（默认 `https://api.openai.com/v1`）、`backend_model`、`backend_key` |
| Ollama（本地） | `backend: ollama`、`backend_url`（默认 `http://localhost:11434/v1`）、`backend_model`（如 `qwen2.5`），不需要 key |
| DeepL | `backend: deepl`、`backend_key`（以 `:fx` 结尾的 key 自动走免费 API）；`backend_url` 只在自定义主机时填写 |

每个请求最多等 15 秒。`/twinline status` 会显示后端和主机。

## 9. 更新与卸载

- **更新：** `/plugin` → **Installed** → **twinline** → **Update now**，或在 shell 里运行 `claude plugin update twinline@twinline`；然后重启 Claude Code（或新开会话）。
- **卸载：** `/plugin` → **Installed** → **twinline** → **Uninstall**，或运行 `claude plugin uninstall twinline@twinline`。
- **你的数据：** 原文与译文缓存保存在 `~/.claude/plugins/store/twinline_twinline-*.json`。卸载不会删除这个文件；关闭 Claude Code 后删除它，即可清除 Twinline 保存的全部内容。

## 10. 故障排查

| 现象 | 检查 |
|---|---|
| 输入框上方没有状态条 | Twinline 已关闭且 `show_band_when_off` 为 `false`：`/twinline on`，或把 `show_band_when_off` 改回 `true`。 |
| 我的消息下面没有 `EN · …` 行 | 文本被当成了英文（只含拉丁字母，见 §6）、以 `/` 或 `!` 开头，或输入翻译已关闭（用 `/tl` 查看）。 |
| 提示 `Twinline: translation failed (api-error), sent as typed` | 登录可能已过期（运行 `/login`），或组织策略禁用了该模型（试试 `/tl model sonnet`）。每个会话只提示一次。 |
| 提示 `… translation failed (timeout) …` | 模型用时超过 `input_timeout_ms`；调大这个值，或重试。 |
| 回复没有译文 | 输出翻译已关闭（`/tl`）；Claude 直接用你的语言回答了（Claude Code 自身的 `language` 设置，见 §6）；这条回复是恢复会话后重新绘制的历史；Desktop 里两次工具调用之间的文字不会交给插件。 |
| 某条译文看起来不对 | `/twinline status` 会显示失败次数；译文会跨会话缓存，改了术语表或语言后，对新文本生效。 |
| Desktop 提示 `/twinline isn't a command here.` | Desktop 上属于预期现象（见 §2）：命令已经执行，看它的输出行和状态条即可。可以用状态条按钮切换，不用命令。 |
| Twinline 完全没反应 | `/plugin` 的已启用 mod 里应该有 `twinline`。运行 `claude --debug-file ./twinline.log`，复现问题，在日志里找含 `twinline` 的行（`hook skipped` 或 `refused` 会说明原因）。 |
| 好像加载了两份 | `CLAUDE_CODE_PLUGIN_DIRS` 或 `--plugin-dir` 指向的开发目录会替换同名的已安装版本。 |

## 11. 常见问题

**Twinline 会把我的文字发到别处吗？** 默认不会：翻译经 Claude Code 的 mods API 用你的登录完成。只有你配置的外部后端（§8）会收到文本，而且每个会话都会提示。详见 README 的隐私一节。

**要花多少钱？** 每次翻译是一次小模型调用（默认 Haiku），计入你的 Claude 套餐：每条输入一次，每个回复块一次。重复的文本直接用缓存。

**模型会看到我的原文吗？** 不会。Claude 和对话记录只看到英文。原文保存在 Twinline 自己的存储里，只在你本机。

**能在 VS Code 或手机上用吗？** 那里也会翻译输入，但不会绘制对照行和状态条。
