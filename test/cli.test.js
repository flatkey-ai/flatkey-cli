import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgv, runCommand } from "../src/cli.js";

test("parses image generation with prompt and json mode", () => {
  const command = parseArgv(["image", "generate", "--prompt", "city at dawn", "--json"]);

  assert.deepEqual(command, {
    group: "image",
    action: "generate",
    options: {
      prompt: "city at dawn",
      json: true,
    },
  });
});

test("parses credits with json mode", () => {
  const command = parseArgv(["credits", "--json"]);

  assert.deepEqual(command, {
    group: "credits",
    action: undefined,
    options: {
      json: true,
    },
  });
});

test("parses text generation with dry-run", () => {
  const command = parseArgv([
    "text",
    "generate",
    "--prompt",
    "write lead",
    "--model",
    "gpt-5.5",
    "--dry-run",
    "--json",
  ]);

  assert.deepEqual(command, {
    group: "text",
    action: "generate",
    options: {
      prompt: "write lead",
      model: "gpt-5.5",
      dry_run: true,
      json: true,
    },
  });
});

test("parses output aliases", () => {
  assert.equal(
    parseArgv(["image", "generate", "--prompt", "x", "--output", "out.png"]).options.output,
    "out.png",
  );
  assert.equal(
    parseArgv(["video", "generate", "--prompt", "x", "-o", "clip.mp4"]).options.output,
    "clip.mp4",
  );
});

test("parses video ratio and resolution controls", () => {
  const command = parseArgv([
    "video",
    "generate",
    "--prompt",
    "clip",
    "--ratio",
    "9:16",
    "--resolution",
    "1080p",
  ]);

  assert.deepEqual(command.options, {
    prompt: "clip",
    ratio: "9:16",
    resolution: "1080p",
  });
});

test("parses audio voice generation controls", () => {
  const command = parseArgv([
    "audio",
    "generate",
    "--prompt",
    "hello",
    "--voice-id",
    "voice-123",
    "--stability",
    "0.5",
    "--similarity-boost",
    "0.75",
    "--style",
    "0",
    "-o",
    "speech.mp3",
  ]);

  assert.deepEqual(command, {
    group: "audio",
    action: "generate",
    options: {
      prompt: "hello",
      voice_id: "voice-123",
      stability: "0.5",
      similarity_boost: "0.75",
      style: "0",
      output: "speech.mp3",
    },
  });
});

test("parses audio sfx, music, and voices actions", () => {
  assert.equal(parseArgv(["audio", "sfx", "--prompt", "glass", "--duration", "3"]).action, "sfx");
  assert.equal(parseArgv(["audio", "music", "--prompt", "piano", "--music-length-ms", "10000"]).action, "music");
  assert.equal(parseArgv(["audio", "voices", "--json"]).action, "voices");
});

test("parses ai help", () => {
  const command = parseArgv(["help", "--ai"]);

  assert.deepEqual(command, {
    group: "help",
    action: undefined,
    options: {
      ai: true,
    },
  });
});

test("parses per-command help forms", () => {
  assert.deepEqual(parseArgv(["video", "--help"]), {
    group: "video",
    action: undefined,
    options: { help: true },
  });
  assert.deepEqual(parseArgv(["video", "generate", "--help"]), {
    group: "video",
    action: "generate",
    options: { help: true },
  });
  assert.deepEqual(parseArgv(["audio", "sfx", "help"]), {
    group: "audio",
    action: "sfx",
    options: { help: true },
  });
  assert.deepEqual(parseArgv(["help", "image"]), {
    group: "help",
    action: undefined,
    options: { command: "image" },
  });
});

test("prompt value help is not parsed as command help", () => {
  assert.deepEqual(parseArgv(["text", "generate", "--prompt", "help"]).options, {
    prompt: "help",
  });
});

test("per-command help returns without api key lookup", async () => {
  assert.match(await runCommand({ group: "video", action: "generate", options: { help: true } }), /--ratio/);
  assert.match(await runCommand({ group: "models", action: undefined, options: { help: true } }), /--type/);
});

test("parses global version aliases", () => {
  assert.deepEqual(parseArgv(["--version"]), {
    group: "version",
    action: undefined,
    options: {},
  });
  assert.deepEqual(parseArgv(["-v"]), {
    group: "version",
    action: undefined,
    options: {},
  });
});

test("rejects unknown commands", () => {
  assert.throws(
    () => parseArgv(["wat"]),
    /Unknown command: wat/,
  );
});

test("version command matches package version", async () => {
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8"));

  assert.equal(await runCommand({ group: "version", options: {} }), pkg.version);
  assert.deepEqual(await runCommand({ group: "version", options: { json: true } }), {
    version: pkg.version,
  });
});
