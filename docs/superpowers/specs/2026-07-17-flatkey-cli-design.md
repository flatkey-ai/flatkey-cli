# Flatkey CLI Design

## Goal

Build `@flatkey-ai/cli`, a cross-platform npm CLI for media workers and AI agents to use Flatkey as the most cost-effective practical AI API entrypoint for image, video, and audio generation. The CLI should make cost, credits, model choice, upload inputs, generation jobs, and saved artifacts visible from the terminal.

## Scope

The CLI provides:

- Image generation.
- Video generation.
- Audio generation.
- Cost estimation before generation.
- Generation job creation, listing, inspection, and waiting.
- Uploads for local image, video, and audio inputs.
- Credit balance and usage status.
- Recent credit transactions.
- AI-first help output.
- Available model listing.
- Model parameter inspection.
- Local onboarding for a Flatkey API key.
- A short ASCII animation during human-facing generation commands.

The first implementation is a Node.js npm package. It runs on Windows, Linux, and macOS through Node. Homebrew, apt/deb, and MSI packaging are release channels around the npm package, not separate native implementations.

## Package and Binary

Package name: `@flatkey-ai/cli`.

Primary binary: `flatkey`.

The package uses ESM JavaScript and keeps runtime dependencies minimal. It should run with the current active Node LTS line and newer.

## Command Surface

Top-level commands:

- `flatkey onboard [--api-key <key>]`
- `flatkey image generate --prompt "<prompt>" [options]`
- `flatkey video generate --prompt "<prompt>" [options]`
- `flatkey audio generate --prompt "<prompt>" [options]`
- `flatkey generate create <model> --prompt "<prompt>" [options]`
- `flatkey generate cost <model> --prompt "<prompt>" [options]`
- `flatkey generate get <job-id> [--json]`
- `flatkey generate list [--type image|video|audio] [--json]`
- `flatkey generate wait <job-id> [--json]`
- `flatkey upload create <file> [--json]`
- `flatkey upload list [--type image|video|audio] [--json]`
- `flatkey credits [--json]`
- `flatkey status [--json]`
- `flatkey transactions [--size <count>] [--json]`
- `flatkey models [--type image|video|audio] [--json]`
- `flatkey models get <model> [--json]`
- `flatkey help [--ai] [--json]`
- `flatkey version`

Shared generation options:

- `--model <model>`
- `--base-url <url>`
- `--api-key <key>`
- `--out <dir>`
- `--json`

Image-specific options:

- `--size <width>x<height>`
- `--aspect <ratio>`
- `--n <count>`
- `--quality <quality>`

Video-specific options:

- `--duration <seconds>`
- `--aspect <ratio>`
- `--fps <number>`

Audio-specific options:

- `--voice <voice>`
- `--format <mp3|wav|aac|flac>`

## Authentication and Config

Credential resolution order:

1. `--api-key`
2. `FLATKEY_API_KEY`
3. Saved config at `~/.config/flatkey/config.json`

`flatkey onboard` writes the config file with mode `0600` where supported. Windows should ignore chmod failures.

## Flatkey API Integration

Default base URL: `https://router.flatkey.ai`.

Image generation follows the proven `awesome-images` behavior:

- OpenAI-compatible image endpoint: `POST /v1/images/generations`
- Gemini-style Nano endpoint: `POST /v1beta/models/{model}:generateContent?key={apiKey}`

The CLI should default image generation to the Nano route when `--model` is omitted or starts with `nano`, and use `/v1/images/generations` for `gpt` or `gpt-image-*`.

Video, audio, cost, jobs, uploads, credits, status, transactions, and models are implemented through small provider functions with configurable endpoint paths. The initial default paths are:

- `POST /v1/videos/generations`
- `POST /v1/audio/generations`
- `POST /v1/generations`
- `POST /v1/generations/cost`
- `GET /v1/generations`
- `GET /v1/generations/{jobId}`
- `POST /v1/uploads`
- `GET /v1/uploads`
- `GET /v1/credits`
- `GET /v1/credits/transactions`
- `GET /v1/status`
- `GET /v1/models`
- `GET /v1/models/{model}`

If Flatkey router returns a different shape, adapters normalize results before printing or saving artifacts.

## Output and Artifacts

Default output directory: `flatkey-output`.

Generation commands save returned files when the API returns base64 or data URLs, and print remote URLs when the API returns URLs. JSON mode prints a machine-readable payload and suppresses animation/logging.

Artifact naming:

- `image-01.png`
- `video-01.mp4`
- `audio-01.mp3`

Extensions come from returned MIME types when available.

## AI-First Help

`flatkey help --ai` prints a compact protocol-style guide:

- Required setup.
- Commands.
- Arguments.
- Environment variables.
- JSON mode contract.
- Example calls for image, video, audio, cost, upload, job wait, credits, transactions, status, and models.
- Error recovery instructions for missing key, unknown model, and API failure.

Human `--help` remains readable but secondary.

## Models

`flatkey models` fetches remote model metadata when API key and network are available. If remote fetch fails, it falls back to bundled defaults:

- Image: `nano-banana-pro-preview`, `nano-banana-flash`, `gpt-image-2`
- Video: `veo-3`, `veo-3-fast`
- Audio: `tts-1`, `gpt-4o-mini-tts`

The fallback must mark `source: "bundled"` in JSON output.

## ASCII Animation

Human generation mode shows a short stderr animation before and during network calls. Requirements:

- Uses plain ASCII only.
- No animation in `--json`.
- Does not corrupt stdout artifact paths.
- Works in Windows terminals.
- Automatically falls back to simple log lines when stderr is not a TTY.

## Error Handling

Errors should be short and actionable:

- Missing key: explain `flatkey onboard` and `FLATKEY_API_KEY`.
- Unknown command: point to `flatkey help --ai`.
- HTTP failure: show API message when present, otherwise status code.
- Save failure: show output path and filesystem error.

JSON mode errors still exit non-zero and write error JSON to stderr.

## Testing

Use Node's built-in `node:test` and `assert/strict`.

Test coverage:

- Argument parsing.
- Config read/write and env precedence.
- Request building for image OpenAI and Nano routes.
- Request building for video/audio/credits/status/models.
- Artifact persistence from base64, data URL, and URL payloads.
- JSON mode suppresses animation/logging.
- CLI subprocess tests against local HTTP servers.

## Release Channels

Primary release is npm:

- `npm publish --access public`
- Users run `npx @flatkey-ai/cli` or install globally.

Secondary release assets:

- Homebrew formula that installs the npm package and exposes `flatkey`.
- Debian package wrapping the npm package and generated launcher.
- MSI package wrapping the npm package and generated Windows launcher.

Release automation should be added after the CLI is working and tested.
