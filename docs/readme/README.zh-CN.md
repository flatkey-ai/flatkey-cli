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

推荐用环境变量：

```bash
export FLATKEY_API_KEY=<your-flatkey-api-key>
```

也可以保存到本地配置：

```bash
flatkey onboard --api-key <key>
```

## 快速开始

```bash
flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" --model seedance2 -o launch.mp4
flatkey audio generate --prompt "你好，这是 Flatkey 的配音测试" -o speech.mp3
flatkey models --json
flatkey credits --json
```

## 常用命令

### 生成图片

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

### 生成视频

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  -o launch.mp4
```

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
flatkey models --type image --json
flatkey help --ai
```

## 给 AI Agent 的最短说明

把这段直接给 AI：

```text
你可以用 Flatkey CLI 做媒体生成。

安装：npm install -g @flatkey-ai/cli
鉴权：使用环境变量 FLATKEY_API_KEY。

规则：
1. 需要机器可读输出时，命令加 --json。
2. 需要本地文件时，必须加 --output 或 -o。
3. 不确定模型时，先跑 flatkey models --json。
4. 做 TTS 前，先跑 flatkey audio voices --json 拿 voice_id。
5. 看请求但不烧钱，用 --dry-run --json。
```

## 路由

- 生成路由：`https://router.flatkey.ai`
- 模型列表：`https://console.flatkey.ai/v1/available_models`
- 音色列表：`https://router.flatkey.ai/v1/voices`

## 链接

- 官网：[flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_zh&utm_campaign=flatkey_cli_links)
- npm：[`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)
- Issues：[github.com/flatkey-ai/flatkey-cli/issues](https://github.com/flatkey-ai/flatkey-cli/issues)
