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

test("rejects unknown commands", () => {
  assert.throws(
    () => parseArgv(["wat"]),
    /Unknown command: wat/,
  );
});

test("version command matches package version", async () => {
  const pkg = JSON.parse(await (await import("node:fs/promises")).readFile("package.json", "utf8"));

  assert.deepEqual(await runCommand({ group: "version", options: {} }), {
    version: pkg.version,
  });
});
