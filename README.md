# Flatkey CLI

[![npm version](https://img.shields.io/npm/v/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@flatkey-ai/cli.svg)](https://www.npmjs.com/package/@flatkey-ai/cli)
[![Publish npm](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/flatkey-ai/flatkey-cli/actions/workflows/npm-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Creative generation from the terminal for media teams and AI agents. Generate images, videos, audio, and text through one Flatkey credit balance.

Website: [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme&utm_campaign=flatkey_cli)

```bash
npm install -g @flatkey-ai/cli
export FLATKEY_API_KEY=<your-flatkey-api-key>

flatkey image generate --prompt "editorial cover, neon city at dawn" -o cover.png
flatkey video generate --prompt "cinematic product launch clip" --model seedance2 -o launch.mp4
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

Use an environment variable:

```bash
export FLATKEY_API_KEY=<key>
```

Or save it locally:

```bash
flatkey onboard --api-key <key>
```

Get a key from [flatkey.ai](https://flatkey.ai/?utm_source=github&utm_medium=readme&utm_campaign=flatkey_cli_auth).

## Commands

### Generate Image

```bash
flatkey image generate \
  --prompt "magazine cover, reflective typography, studio lighting" \
  --model gpt-image-2 \
  -o cover.png
```

### Generate Video

```bash
flatkey video generate \
  --prompt "8 second cinematic product reveal, glossy black background" \
  --model seedance2 \
  -o launch.mp4
```

### Generate Audio

```bash
flatkey audio generate \
  --prompt "30 second confident product voiceover" \
  --model gemini-2.5-flash-preview-tts \
  -o voiceover.mp3
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
flatkey models --type image --json
flatkey help --ai
```

## Models

Live model list:

```bash
flatkey models --json
```

Useful current defaults:

| Type | Models |
| --- | --- |
| Image | `gpt-image-2`, `nano-banana-pro-preview`, Gemini image models |
| Video | `seedance2`, `veo-3`, `veo-3-fast` |
| Audio | Gemini TTS models, `tts-1`, `gpt-4o-mini-tts` |
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
- Call `flatkey models --json` before choosing a model.
- Use `--dry-run` to inspect request shape without spending credits.

Example dry run:

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
