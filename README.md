# @flatkey-ai/cli

Unified Flatkey CLI for media workers. Generate images, videos, and audio through Flatkey credits.

## Install

```bash
npm install -g @flatkey-ai/cli
```

Or run without installing:

```bash
npx @flatkey-ai/cli help --ai
```

## Auth

```bash
flatkey onboard --api-key <key>
```

Or use:

```bash
export FLATKEY_API_KEY=<key>
```

## Commands

```bash
flatkey image generate --prompt "magazine cover" --json
flatkey video generate --prompt "product launch clip" --json
flatkey audio generate --prompt "30 second voiceover" --json
flatkey credits --json
flatkey status --json
flatkey models --json
flatkey help --ai
```

Default router: `https://router.flatkey.ai`.

## Release Channels

Primary release is npm package `@flatkey-ai/cli`.

Planned wrappers:

- Homebrew formula.
- Debian `.deb` package for apt-based install.
- Windows MSI package.
