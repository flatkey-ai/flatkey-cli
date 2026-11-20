# Flatkey CLI

[![npm version](https://img.shields.io/npm/v/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![Publish npm](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml)

给媒体团队和 AI Agent 用的 Flatkey 命令行工具。一个 CLI 调用图片、视频、语音、音效、音乐和文本生成，共用同一套 Flatkey credits。

语言：[English](../../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

官网：[flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_zh&utm_campaign=flatkey_cli)

## 安装

```bash
npm install -g @flatkey-ai/cli
```

查看本地版本：

```bash
flatkey --version
flatkey -v
```

## 鉴权

推荐用浏览器登录：

```bash
flatkey login
```

`flatkey login` 会打开 Flatkey 控制台授权页，授权成功后把 CLI API key 和账号信息保存到本地配置。登录后可以检查当前生效的鉴权状态：

```bash
flatkey auth status
flatkey status --json
```

如果终端不能自动打开浏览器，可以只打印授权链接，手动复制打开：

```bash
flatkey login --no-open
```

退出登录并移除本地保存的 API key：

```bash
flatkey logout
```

也可以用环境变量：

```bash
export FLATKEY_API_KEY=<your-flatkey-api-key>
```

或手动创建 key 后保存到本地配置：

```bash
flatkey onboard --api-key <key>
```

## 快速开始

```bash
flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" -o launch.mp4
flatkey audio generate --prompt "你好，这是 Flatkey 的配音测试" -o speech.mp3
flatkey models --json
flatkey credits --json
```

## 常用命令

正式生成图片或视频时，CLI 会从当前账号的模型目录中选择能处理本次参数的模型。传入 `--model` 可固定模型 ID，跳过目录查询。

### 生成图片

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

本地参考图用 `--file`，远程参考图用 `--image-url`。正式请求中，如果 HEAD 无法确认签名 URL 的素材类型，CLI 会用 GET 检查文件开头最多 64 KiB。

| 图像模型 | 有参考图时的接口 | 参考图格式 |
| --- | --- | --- |
| GPT Image | `/v1/images/edits` | `images[].image_url` |
| Gemini（含 Nano Banana） | `/v1beta/models/{model}:generateContent` | `fileData` 部件包含 URL 和 MIME 类型 |
| Seedream | `/v1/images/generations` | `image` 是 URL 数组。Seedream 5 支持 `--output-format png` 或 `jpeg`。 |
| Grok Imagine | `/v1/images/edits` | 单图用 `image`，多图用 `images`。原生 xAI 接口最多接受 5 张，订阅通道最多接受 3 张。 |

`grok-2-image-1212` 用于文生图，编辑参考图时请选择 Imagine 型号。需要指定质量时，可选 `grok-imagine-image-2.0` 并传入 `--quality low`、`medium` 或 `auto`。

Gemini 拦截请求或未返回图片时，CLI 以非零状态退出。使用 `--json` 时，标准错误输出中的 `error.code` 分别是 `image_generation_blocked` 和 `image_no_output`。

### 生成视频

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  -o launch.mp4
```

Seedance 2.5 用 `--first-frame` 或 `--first-frame-url` 指定首帧，宽高比跟随首帧。可省略 `--ratio` 或传 `--ratio adaptive`。MiniMax H3 支持 `--resolution 768P`（默认）或 `2K`。视频默认生成音频，需要静音时传 `--generate-audio false`。

`video generate` 和 `video copy` 支持 `--no-wait`，异步任务受理后立即返回 `taskId`。CLI 已收到任务 ID 时，等待超时或任务失败的 JSON 错误中会保留 `error.taskId`。排队或处理中的任务可以用同一 ID 查询，完成后下载。

```bash
flatkey video generate --prompt "slow camera pan" --no-wait --json
task_id="task_..."
flatkey video status "$task_id" --json
flatkey video download --task-id "$task_id" -o launch.mp4 --json
```

### 离线预演

加 `--dry-run --json` 可以离线查看请求。本地素材显示为 `<upload: 路径>`，远程 URL 原样保留，跳过上传和 URL 探测。`video copy --source input.mp4 --dry-run` 会用占位符表示待生成的深度视频，无需启动视频运行时。预演中省略 `--model` 时，`previewModel` 给出离线示例使用的模型。

### 生成语音

```bash
flatkey audio generate \
  --prompt "你好，这是 Flatkey 网关的语音测试。" \
  --voice-id EXAVITQu4vr4xnSDxMaL \
  --model eleven_multilingual_v2 \
  --stability 0.5 \
  --similarity-boost 0.75 \
  --style 0 \
  -o speech.mp3
```

### 查询音色

```bash
flatkey audio voices --json
```

### 生成音效

```bash
flatkey audio sfx \
  --prompt "glass shattering on the floor" \
  --duration 3 \
  -o sfx.mp3
```

### 生成音乐

```bash
flatkey audio music \
  --prompt "calm ambient piano, sad mood" \
  --music-length-ms 10000 \
  -o music.mp3
```

### 生成文本

```bash
flatkey text generate \
  --prompt "write 5 sharp headlines for a creator tool launch" \
  --model gpt-5.5 \
  -o headlines.txt
```

### Credits、状态、模型

```bash
flatkey credits --json
flatkey status --json
flatkey models --json
flatkey models --type image --pricing --json
flatkey help --ai
```

图像模型的 JSON 结果包含 `cliSupported`，表示 CLI 是否支持该模型。`models --pricing` 增加公开的 PLG 美元单价。JSON 中的 `pricingGroup` 为 `"plg"`，每个模型的 `pricing` 字段列出价格，没有公开单价时为 `null`。实际费用取决于账号和用量。

## 给 AI Agent 的最短说明

把这段直接给 AI：

```text
你可以用 Flatkey CLI 做媒体生成。

安装：npm install -g @flatkey-ai/cli
鉴权：优先运行 flatkey login；也可以使用环境变量 FLATKEY_API_KEY。

规则：
1. 需要机器可读输出时，命令加 --json。
2. 需要本地文件时，必须加 --output 或 -o。
3. 不确定模型时，先跑 flatkey models --json。
4. 做 TTS 前，先跑 flatkey audio voices --json 拿 voice_id。
5. 用 --dry-run --json 离线预览生成请求。
```

## 路由

- 生成路由：`https://router.flatkey.ai`
- 模型列表：`https://console.flatkey.ai/v1/available_models`
- 音色列表：`https://router.flatkey.ai/v1/voices`

## 链接

- 官网：[flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_zh&utm_campaign=flatkey_cli_links)
- npm：[`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)
- Issues：[github.com/flatkey-ai/flatkey-cli/issues](https://github.com/flatkey-ai/flatkey-cli/issues)
