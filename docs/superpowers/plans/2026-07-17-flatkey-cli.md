# Flatkey CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@flatkey-ai/cli`, a Node.js CLI for Flatkey image, video, audio, credits, status, models, onboarding, and AI-first help.

**Architecture:** Use small ESM modules with dependency-injected `fetch`, filesystem paths, and streams so behavior can be tested without real Flatkey calls. The CLI parser converts argv into command objects, command handlers call provider functions, and output helpers keep human logs off stdout in JSON mode.

**Tech Stack:** Node.js ESM, npm package bin, built-in `node:test`, `assert/strict`, `fs/promises`, `child_process`, and global `fetch`.

---

## File Structure

- `package.json`: npm metadata, bin mapping, scripts, engines.
- `bin/flatkey.js`: executable entrypoint.
- `src/cli.js`: argv parsing, command dispatch, exit handling.
- `src/config.js`: API key/config resolution and onboarding writes.
- `src/api.js`: Flatkey HTTP requests and route selection.
- `src/artifacts.js`: save base64/data URL/url artifacts.
- `src/help.js`: human and AI help text.
- `src/models.js`: bundled fallback model list and remote normalization.
- `src/animation.js`: ASCII animation lifecycle.
- `test/*.test.js`: focused tests for each module and CLI subprocess behavior.

## Task 1: Package and Parser

- [ ] Write failing tests in `test/cli.test.js` for `parseArgv`, including `flatkey image generate --prompt x --json`, `flatkey credits --json`, unknown command, and `flatkey help --ai`.
- [ ] Run `npm test -- test/cli.test.js`; expect module-not-found or function-not-found failure.
- [ ] Create `package.json`, `bin/flatkey.js`, and `src/cli.js` with minimal parser and dispatch stubs.
- [ ] Run `npm test -- test/cli.test.js`; expect parser tests pass.
- [ ] Commit: `feat: add cli parser`

## Task 2: Config and Onboarding

- [ ] Write failing tests in `test/config.test.js` for API key precedence: option, `FLATKEY_API_KEY`, saved config, and missing key error.
- [ ] Write failing test for `writeConfig` creating config JSON with `apiKey`.
- [ ] Run `npm test -- test/config.test.js`; expect missing module failure.
- [ ] Create `src/config.js` and wire `onboard` command to write config.
- [ ] Run `npm test -- test/config.test.js test/cli.test.js`; expect pass.
- [ ] Commit: `feat: add flatkey config`

## Task 3: API Requests

- [ ] Write failing tests in `test/api.test.js` for Nano image route, OpenAI image route, video route, audio route, credits route, status route, and models route using injected fetch.
- [ ] Run `npm test -- test/api.test.js`; expect missing module failure.
- [ ] Create `src/api.js` with `FlatkeyError`, `generateImage`, `generateVideo`, `generateAudio`, `getCredits`, `getStatus`, and `getModels`.
- [ ] Run `npm test -- test/api.test.js`; expect pass.
- [ ] Commit: `feat: add flatkey api client`

## Task 4: Artifacts and Model Fallback

- [ ] Write failing tests in `test/artifacts.test.js` for saving base64, data URL, and preserving URL outputs.
- [ ] Write failing tests in `test/models.test.js` for bundled fallback shape and type filtering.
- [ ] Run targeted tests; expect missing module failures.
- [ ] Create `src/artifacts.js` and `src/models.js`.
- [ ] Run targeted tests; expect pass.
- [ ] Commit: `feat: add artifact and model helpers`

## Task 5: Help and Animation

- [ ] Write failing tests in `test/help.test.js` checking `help --ai` includes setup, JSON contract, image/video/audio examples, credits, status, and models.
- [ ] Write failing tests in `test/animation.test.js` checking no animation when JSON mode or non-TTY.
- [ ] Run targeted tests; expect missing module failures.
- [ ] Create `src/help.js` and `src/animation.js`.
- [ ] Run targeted tests; expect pass.
- [ ] Commit: `feat: add help and animation`

## Task 6: Command Integration

- [ ] Write failing subprocess tests in `test/integration.test.js` with a local HTTP server for `image generate --json`, `video generate --json`, `audio generate --json`, `credits --json`, `status --json`, and `models --json`.
- [ ] Run `npm test -- test/integration.test.js`; expect command behavior missing.
- [ ] Wire command handlers in `src/cli.js` to config, API, artifacts, models, help, and animation.
- [ ] Run `npm test`; expect pass.
- [ ] Commit: `feat: wire flatkey cli commands`

## Task 7: Release Metadata

- [ ] Write failing tests or static checks for package name `@flatkey-ai/cli`, bin `flatkey`, and executable bin file.
- [ ] Add `README.md` with install, auth, commands, and release channel notes.
- [ ] Add `release/homebrew/flatkey.rb`, `release/deb/README.md`, and `release/msi/README.md` as packaging stubs that wrap npm package release.
- [ ] Run `npm test`.
- [ ] Commit: `docs: add release notes`

## Final Verification

- [ ] Run `npm test`.
- [ ] Run `node bin/flatkey.js help --ai`.
- [ ] Run `node bin/flatkey.js models --json` without network key and confirm bundled fallback.
- [ ] Run `git status --short`.
