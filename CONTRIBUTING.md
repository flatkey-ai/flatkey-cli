# Contributing

Thanks for improving Flatkey CLI.

## Setup

```bash
git clone https://github.com/flatkey-ai/flatkey-cli.git
cd flatkey-cli
npm install
npm test
```

## Local CLI

```bash
node bin/flatkey.js --version
node bin/flatkey.js help --ai
node bin/flatkey.js image generate --prompt "test" --dry-run --json
```

## Tests

Run all tests before opening a PR:

```bash
npm test
```

Live tests require `FLATKEY_API_KEY` and can spend credits. Keep routine tests mocked or `--dry-run`.

## Pull Requests

- Keep changes small and focused.
- Add or update tests for behavior changes.
- Do not commit API keys, generated media, or local config.
- Use `--dry-run` examples when possible.
