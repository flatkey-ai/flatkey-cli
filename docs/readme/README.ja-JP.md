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

Recommended: sign in through the Flatkey console:

```bash
flatkey login
```

`flatkey login` opens the Flatkey console authorization page, waits for approval, then saves the CLI API key and account metadata locally. After login, check the active auth state:

```bash
flatkey auth status
flatkey status --json
```

If your terminal cannot open a browser automatically, print the approval URL and open it yourself:

```bash
flatkey login --no-open
```

Remove the saved API key:

```bash
flatkey logout
```

Alternative: use `FLATKEY_API_KEY`:

```bash
export FLATKEY_API_KEY=<your-flatkey-api-key>
```

Or save a manually created key locally:

```bash
flatkey onboard --api-key <key>
```

## Quick Start

```bash
flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" -o launch.mp4
flatkey audio generate --prompt "Flatkey voice test" -o speech.mp3
flatkey models --json
flatkey credits --json
```

## Commands

画像や動画を生成するとき、CLI はアカウントのモデル一覧から指定したオプションに対応するモデルを選びます。`--model` でモデル ID を指定すると、一覧の取得を省略してそのモデルを使います。

### 画像生成

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

ローカルの参照画像は `--file`、リモート画像は `--image-url` で指定します。生成時に HEAD で署名付き URL の形式を確認できない場合、CLI は GET で先頭の最大 64 KiB を読み取ります。

| 画像モデル | 参照画像を送るエンドポイント | 参照画像の形式 |
| --- | --- | --- |
| GPT Image | `/v1/images/edits` | `images[].image_url` |
| Gemini（Nano Banana を含む） | `/v1beta/models/{model}:generateContent` | URL と MIME タイプを含む `fileData` パート |
| Seedream | `/v1/images/generations` | URL の配列 `image`。Seedream 5 の出力には `--output-format png` または `jpeg` を指定可能 |
| Grok Imagine | `/v1/images/edits` | 1 枚なら `image`、複数枚なら `images`。xAI のネイティブ API は 5 枚まで、サブスクリプション経由は 3 枚まで |

`grok-2-image-1212` はテキストから画像を生成します。参照画像の編集には Imagine モデルを選んでください。`grok-imagine-image-2.0` では `--quality` に `low`、`medium`、`auto` を指定できます。

Gemini がリクエストをブロックした場合や画像を返さなかった場合、CLI の終了コードは非ゼロです。`--json` を付けると、標準エラー出力の `error.code` にそれぞれ `image_generation_blocked` または `image_no_output` が入ります。

### 動画生成

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  -o launch.mp4
```

Seedance 2.5 で `--first-frame` または `--first-frame-url` を使うと、動画の縦横比は先頭フレームに従います。`--ratio` は省略するか、`adaptive` を指定してください。MiniMax H3 の解像度は `768P`（既定値）または `2K` です。動画は既定で音声付きです。無音にするには `--generate-audio false` を指定します。

`video generate` と `video copy` に `--no-wait` を付けると、非同期タスクの受理直後に `taskId` が返ります。CLI がタスク ID を受け取った後でタイムアウトや失敗が起きても、JSON のエラーには `error.taskId` が残ります。待機中や処理中は同じ ID で状態を確認し、完了後に動画を保存します。

```bash
flatkey video generate --prompt "slow camera pan" --no-wait --json
task_id="task_..."
flatkey video status "$task_id" --json
flatkey video download --task-id "$task_id" -o launch.mp4 --json
```

### オフラインでのプレビュー

`--dry-run --json` でリクエストをプレビューできます。ローカル素材は `<upload: パス>`、リモート URL は入力どおりに表示し、アップロードや URL の検査を省略します。`video copy --source input.mp4 --dry-run` は動画ランタイムを起動せず、深度動画をプレースホルダーで示します。`--model` を省略した場合は、`previewModel` がオフラインプレビューに使用したモデルを示します。

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
flatkey models --type image --pricing --json
flatkey help --ai
```

画像モデルの JSON では `cliSupported` で CLI の対応状況を確認できます。`models --pricing` は PLG の公開単価を米ドルで表示します。JSON では `pricingGroup` に `"plg"`、各モデルの `pricing` に料金情報が入ります。単価が未掲載の場合は `null` です。実際の請求額はアカウントと利用量によって決まります。

## Agent Protocol

Give this to an AI agent:

```text
Use Flatkey CLI for media generation.

Install: npm install -g @flatkey-ai/cli
Auth: prefer flatkey login; FLATKEY_API_KEY also works.

Rules:
1. Use --json for machine-readable output.
2. Use --output or -o when a local file path matters.
3. Run flatkey models --json before choosing a model.
4. Run flatkey audio voices --json before choosing a TTS voice_id.
5. Use --dry-run --json to preview a generation request offline.
```

## Routing

- Generation router: `https://router.flatkey.ai`
- Model registry: `https://console.flatkey.ai/v1/available_models`
- Voice registry: `https://router.flatkey.ai/v1/voices`

## Links

- Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme_ja&utm_campaign=flatkey_cli_links)
- npm: [`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)
- Issues: [github.com/flatkey-ai/flatkey-cli/issues](https://github.com/flatkey-ai/flatkey-cli/issues)
