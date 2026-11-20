# Flatkey CLI

[![npm version](https://img.shields.io/npm/v/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![Publish npm](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Creative generation from the terminal for media teams and AI agents. Generate images, videos, audio, and text through one Flatkey credit balance.

Languages: [English](README.md) | [简体中文](docs/readme/README.zh-CN.md) | [日本語](docs/readme/README.ja-JP.md)

Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme&utm_campaign=flatkey_cli)

```bash
npm install -g @flatkey-ai/cli
flatkey login

flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" -o launch.mp4
flatkey audio generate --prompt "你好，这是 Flatkey 的配音测试" -o speech.mp3
flatkey models --json
flatkey credits --json
```

## Why Flatkey CLI

- One CLI for image, video, audio, and text generation.
- One `FLATKEY_API_KEY`, one credit balance.
- Agent-friendly JSON mode with clean stdout.
- Local output support with `--output` / `-o`.
- Cross-platform npm package for macOS, Linux, and Windows.
- Cool terminal progress animation for human runs; disabled in `--json` mode.

## Product Comparison

Flatkey is built for media teams that want programmatic generation without paying a premium for a closed creative suite or waiting in long queues. Higgsfield is strong for creator-facing workflows, and Dreamina/Jimeng has good ByteDance video models, but both can become expensive or slow once the workflow moves from manual creation to repeated AI-agent testing. In our testing, Dreamina/Jimeng video generation can wait up to 5 hours during peak time, which makes one-by-one prompt iteration impractical.

| Need | Flatkey | Higgsfield | Dreamina / Jimeng |
| --- | --- | --- | --- |
| Cost for repeat testing | Flatkey token pricing is at least ~20% lower than comparable retail routes, and some modalities such as image can be ~40% lower. | Credit packages can be expensive once premium video/image models are used heavily. | Subscription credits can be cheaper in some local workflows, but API-style automation usually has plan and region constraints. |
| Programmatic access | First-class CLI and API-router workflow. Designed for agents, scripts, and batch testing. | Strong product UI for creators; CLI-style automation is not the primary product promise. | CLI/API access is gated behind higher-tier setup in many workflows, not the default creator entry path. |
| Queue / iteration speed | Built for fast CLI retries, `--dry-run`, local outputs, and unified model routing. | Good for polished creator workflows, but heavy credit usage makes broad testing costly. | Peak-time queues can block video iteration; we have observed waits up to 5 hours for a single video generation test. |
| Modalities | Image, video, TTS, SFX, music, text, credits, status, and model discovery behind one Flatkey key. | Strong image/video creator stack and media tooling. | Strong ByteDance image/video models, especially Seedance/Dreamina-style workflows. |
| Agent ergonomics | `--json`, `--output/-o`, `--dry-run`, `models`, `audio voices`, and predictable stdout/stderr. | More oriented around human creative workflows. | More oriented around app/product workflow than simple agent protocol. |
| Best fit | Media teams building repeatable generation pipelines and AI-agent workflows. | Creators who want a polished visual production suite. | Teams already deep in CapCut/Dreamina/Jimeng ecosystem and willing to accept plan/queue tradeoffs. |

In short: use Flatkey when the job is repeated media generation, cost-sensitive testing, and AI-agent automation. Use creator suites when you want their native editing UI more than a programmable router.

## Install

```bash
npm install -g @flatkey-ai/cli
```

Run without installing:

```bash
npx @flatkey-ai/cli help --ai
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

`flatkey login` opens a browser authorization page, waits for approval, then saves the CLI API key and account metadata in your local Flatkey config. After login, check the active auth state:

```bash
flatkey auth status
flatkey status --json
```

If your terminal cannot open a browser automatically, print the approval URL and open it yourself:

```bash
flatkey login --no-open
```

For staging or self-hosted console testing:

```bash
flatkey login --console-url https://console.flatkey.ai
```

To remove the saved API key:

```bash
flatkey logout
```

Alternative: use an environment variable:

```bash
export FLATKEY_API_KEY=<key>
```

Or save a manually created key locally:

```bash
flatkey onboard --api-key <key>
```

Create a key at [console.flatkey.ai/keys](https://console.flatkey.ai/keys), then pass it with `--api-key`.

## Commands

For live image and video generation, the CLI selects a model from your account's catalog that supports the requested options. Pass `--model` to use a specific model ID and skip the catalog lookup.

### Generate Image

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

Pass a local reference with `--file` or a remote reference with `--image-url`. When HEAD cannot verify a signed URL, the CLI checks up to the first 64 KiB with GET.

| Image model | Endpoint with references | Reference format |
| --- | --- | --- |
| GPT Image | `/v1/images/edits` | `images[].image_url` |
| Gemini image (including Nano Banana) | `/v1beta/models/{model}:generateContent` | `fileData` parts with the URL and MIME type |
| Seedream | `/v1/images/generations` | An `image` array of URLs. The default output is a provider-hosted JPEG. Seedream 5 supports `--output-format png` or `jpeg`. |
| Grok Imagine | `/v1/images/edits` | One `image` object or an `images` array. Native xAI accepts up to five references. The subscription channel accepts three. |

`grok-2-image-1212` generates images from text. For Grok edits, choose an Imagine model. To set `--quality`, use `grok-imagine-image-2.0` with `low`, `medium`, or `auto`.

If Gemini blocks the request or returns no image, the CLI exits with a nonzero status. With `--json`, stderr includes `error.code` (`image_generation_blocked` or `image_no_output`).

Animated GIFs (gpt-image-2.6):

```bash
flatkey image generate \
  --prompt "a paper crane folding itself, soft studio light" \
  --model gpt-image-2.6 \
  --output-format gif \
  --frame-count 9 \
  --frame-duration-ms 200 \
  --quality high \
  --complexity low \
  -o crane.gif
```

GPT Image accepts `png`, `jpeg`, `webp`, or `gif`. For a GPT Image 2.6 animation, use `--frame-count`, `--frame-duration-ms`, `--quality`, and `--complexity`. Saved files use the requested format's extension, such as `flatkey-output/image-01.gif`.

Upload a local image and get a temporary signed URL:

```bash
flatkey image upload --file ./reference.png
```

### Generate Video

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  --ratio 16:9 \
  --resolution 720p \
  -o launch.mp4
```

### Copy Video

Recreate a local 5-15 second video using a generated Depth Anything V2 video
reference:

```bash
flatkey video copy \
  --source input.mp4 \
  --frame-ratio 80 \
  --depth-resolution 480p \
  -o result.mp4
```

`video copy` preserves the source duration by default. The source and requested
duration must be between 5 and 15 seconds. Depth processing uses a platform
runtime downloaded by the CLI; runtime distribution is configured through
`FLATKEY_VIDEO_RUNTIME_BASE_URL` until the Flatkey runtime release channel is
published. The generated depth video is uploaded as the primary motion
reference. If the selected upstream model cannot fetch video references, the
CLI explicitly falls back to three depth keyframes and reports that mode in
JSON output as `depth-keyframes-fallback`.

The available `--ratio` values are `16:9`, `9:16`, `4:3`, `3:4`, `21:9`, `1:1`, and `adaptive`. Seedance supports `480p`, `720p`, and `1080p`. MiniMax H3 accepts `--resolution 768P` (the default) or `2K`. Video requests enable audio by default. Use `--generate-audio false` for a silent clip.

Local reference images are uploaded through Flatkey temporary media first:

```bash
flatkey video generate \
  --model Seedance2.0-pro \
  --prompt "a sleepy kitten, soft window light" \
  --image ./reference.png \
  -o kitten.mp4
```

Seedance 2.5 accepts reference images and videos as ordered content inputs:

```bash
flatkey video generate \
  --model seedance-2-5-pro \
  --prompt "保持人物、服装和镜头运动一致" \
  --image-url https://example.com/character.png \
  --video-url https://example.com/motion.mp4 \
  --ratio adaptive \
  -o result.mp4
```

For Seedance 2.5, the CLI allows up to 30 reference images and 10 reference
videos in one request. Local files are uploaded before generation and all
inputs keep their command-line order. Reference videos can be `.mp4` or `.mov`.

Use `--first-frame` and `--last-frame` for boundary frames. With a Seedance 2.5 first frame, omit `--ratio` or set it to `adaptive` so the video follows the frame's aspect ratio.

```bash
flatkey video generate \
  --model Seedance2.0-pro \
  --prompt "slow camera push-in" \
  --first-frame ./first.png \
  --last-frame ./last.png \
  -o transition.mp4
```

### Resume a video task

Use `--no-wait` with `video generate` or `video copy` to return the `taskId` as soon as an asynchronous task is accepted. If the CLI already has a task ID, timeouts and failures include it as `error.taskId` in JSON. Use the same ID to check a queued task and download its completed output.

```bash
flatkey video generate --prompt "slow camera pan" --no-wait --json
task_id="task_..."
flatkey video status "$task_id" --json
flatkey video download --task-id "$task_id" -o launch.mp4 --json
```

### Generate Audio

Text to speech:

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

List voices:

```bash
flatkey audio voices --json
```

Sound effects:

```bash
flatkey audio sfx \
  --prompt "glass shattering on the floor" \
  --duration 3 \
  -o sfx.mp3
```

Music:

```bash
flatkey audio music \
  --prompt "calm ambient piano, sad mood" \
  --music-length-ms 10000 \
  -o music.mp3
```

### Generate Text

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

Image entries include `cliSupported` in JSON. `models --pricing` adds public PLG unit rates in USD. The JSON includes `pricingGroup: "plg"` and a `pricing` entry for each model (`null` when no public rate is listed). The actual charge depends on your account and usage.

## Models

| Type | Models |
| --- | --- |
| Image | GPT Image (`gpt-image-2`), Gemini (`nano-banana-pro-preview`), Seedream (`seedream-5-0-pro`, `seedream-5-0`, `seedream-4-5`), Grok image |
| Video | Seedance (`seedance2`), MiniMax H3, Veo (`veo-3`, `veo-3-fast`) |
| Audio | `eleven_multilingual_v2`, ElevenLabs voices, sound effects, music |
| Text | `gpt-5.5`, Claude, Gemini, GLM, Grok models |

`models` reads from the Flatkey console model registry. Generation calls use the Flatkey router.

## Agent Protocol

Use this when wiring Flatkey into Codex, Claude Code, Cursor, or other agents:

```bash
flatkey help --ai
```

Agent rules:

- Prefer `FLATKEY_API_KEY`.
- Always pass `--json` for machine-readable output.
- Use `--output` / `-o` when the generated file path matters.
- Use `flatkey image upload --file <path>` for a temporary signed image URL.
- Use `--image`, `--first-frame`, or `--last-frame` to pass local images into video generation.
- Call `flatkey models --json` before choosing a model.
- Call `flatkey audio voices --json` before choosing a TTS `voice_id`.

Use `--dry-run` for an offline preview. Local references appear as `<upload: path>` and remote URLs appear as supplied, with no upload or URL probe. A `video copy` preview uses a placeholder for the depth video and skips the video runtime. When `--model` is omitted, `previewModel` identifies the model used to illustrate the request offline.

```bash
flatkey video generate \
  --prompt "fashion campaign hero shot" \
  --model seedance2 \
  --dry-run \
  --json
```

## Routing

- Generation router: `https://router.flatkey.ai`
- Model registry: `https://console.flatkey.ai/v1/available_models`
- Voice registry: `https://router.flatkey.ai/v1/voices`

Override router only when developing or testing:

```bash
flatkey image generate --prompt "test" --base-url http://127.0.0.1:3000 --json
```

## Release Channels

Primary release:

- npm package: [`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)

Planned wrappers:

- Homebrew formula.
- Debian `.deb` package for apt-based install.
- Windows MSI package.

## Development

```bash
git clone https://github.com/flatkey-ai/flatkey-cli.git
cd flatkey-cli
npm install
npm test
node bin/flatkey.js --version
```

## Links

- Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme&utm_campaign=flatkey_cli_links)
- npm: [`@flatkey-ai/cli`](https://www.npmjs.com/package/@flatkey-ai/cli)
- Issues: [github.com/flatkey-ai/flatkey-cli/issues](https://github.com/flatkey-ai/flatkey-cli/issues)
