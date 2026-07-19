# Flatkey CLI

[![npm version](https://img.shields.io/npm/v/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![Publish npm](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml)

Flatkey CLI は、メディアチームと AI Agent 向けの生成 CLI です。画像、動画、音声、効果音、音楽、テキスト生成を 1 つの Flatkey credit 残高で扱えます。

Languages: [English](../../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_ja&utm_campaign=flatkey_cli)

## Install

```bash
npm install -g @flatkey-ai/cli
```

Check local version:

```bash
flatkey --version
flatkey -v
```

## Auth

Use `FLATKEY_API_KEY`:

```bash
export FLATKEY_API_KEY=<your-flatkey-api-key>
```

Or save it locally:

```bash
flatkey onboard --api-key <key>
```

## Quick Start

```bash
flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" --model seedance2 -o launch.mp4
flatkey audio generate --prompt "Flatkey voice test" -o speech.mp3
flatkey models --json
flatkey credits --json
```

## Commands

### Image

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

### Video

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  -o launch.mp4
```

### Text to Speech

```bash
flatkey audio generate \
  --prompt "This is a Flatkey voice test." \
  --voice-id EXAVITQu4vr4xnSDxMaL \
  --model eleven_multilingual_v2 \
  --stability 0.5 \
  --similarity-boost 0.75 \
  --style 0 \
  -o speech.mp3
```

### Voices

```bash
flatkey audio voices --json
```

### Sound Effects

```bash
flatkey audio sfx \
  --prompt "glass shattering on the floor" \
  --duration 3 \
  -o sfx.mp3
```

### Music

```bash
flatkey audio music \
  --prompt "calm ambient piano, sad mood" \
  --music-length-ms 10000 \
  -o music.mp3
```

### Text

```bash
flatkey text generate \
  --prompt "write 5 sharp headlines for a creator tool launch" \
  --model gpt-5.5 \
  -o headlines.txt
```

### Credits, Status, Models

```bash
flatkey credits --json
flatkey status --json
flatkey models --json
flatkey models --type image --json
flatkey help --ai
```

## Agent Protocol

Give this to an AI agent:

```text
Use Flatkey CLI for media generation.

Install: npm install -g @flatkey-ai/cli
Auth: use FLATKEY_API_KEY.

Rules:
1. Use --json for machine-readable output.
2. Use --output or -o when a local file path matters.
3. Run flatkey models --json before choosing a model.
4. Run flatkey audio voices --json before choosing a TTS voice_id.
5. Use --dry-run --json to inspect requests without spending credits.
```

## Routing

- Generation router: `https://router.flatkey.ai`
- Model registry: `https://console.flatkey.ai/v1/available_models`
- Voice registry: `https://router.flatkey.ai/v1/voices`

## Links

- Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_ja&utm_campaign=flatkey_cli_links)
- npm: [`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)
- Issues: [github.com/flatkey-ai/flatkey-cli/issues](https://github.com/flatkey-ai/flatkey-cli/issues)
