import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

const BIN = new URL("../bin/flatkey.js", import.meta.url).pathname;
const LIVE = process.env.FLATKEY_LIVE_TESTS === "1";

const cases = [
  {
    name: "models list",
    args: ["models", "--json"],
    paid: false,
    expect: (payload) => {
      assert.ok(Array.isArray(payload.models));
      assert.ok(payload.models.length > 0);
    },
  },
  {
    name: "audio voices",
    args: ["audio", "voices", "--json"],
    paid: false,
    expect: (payload) => {
      assert.ok(Array.isArray(payload.voices));
      assert.ok(payload.voices.length > 0);
    },
  },
  {
    name: "audio tts",
    args: ["audio", "generate", "--prompt", "flatkey voice test", "--json"],
    paid: true,
    dryRun: true,
    expect: (payload) => assert.equal(payload.request.url, "https://router.flatkey.ai/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL"),
  },
  {
    name: "audio sfx",
    args: ["audio", "sfx", "--prompt", "glass shattering", "--duration", "3", "--json"],
    paid: true,
    dryRun: true,
    expect: (payload) => assert.equal(payload.request.url, "https://router.flatkey.ai/v1/sound-generation"),
  },
  {
    name: "audio music",
    args: ["audio", "music", "--prompt", "calm ambient piano", "--music-length-ms", "10000", "--json"],
    paid: true,
    dryRun: true,
    expect: (payload) => assert.equal(payload.request.url, "https://router.flatkey.ai/v1/music"),
  },
  {
    name: "image gpt",
    args: ["image", "generate", "--model", "gpt-image-2", "--prompt", "one tiny red square icon", "--json"],
    paid: true,
    dryRun: false,
    expect: (payload) => assert.equal(payload.kind, "image"),
  },
  {
    name: "image nano",
    args: ["image", "generate", "--model", "nano-banana-pro-preview", "--prompt", "one tiny blue square icon", "--json"],
    paid: true,
    dryRun: false,
    expect: (payload) => assert.equal(payload.kind, "image"),
  },
  {
    name: "video seedance2",
    args: ["video", "generate", "--model", "seedance2", "--prompt", "one second newsroom establishing shot", "--duration", "1", "--json"],
    paid: true,
    dryRun: false,
    expect: (payload) => assert.equal(payload.kind, "video"),
  },
  {
    name: "text gpt-5.5",
    args: ["text", "generate", "--model", "gpt-5.5", "--prompt", "Write a five word headline.", "--json"],
    paid: true,
    dryRun: false,
    expect: (payload) => {
      assert.equal(payload.kind, "text");
      assert.equal(typeof payload.text, "string");
    },
  },
];

for (const item of cases) {
  test(`live flatkey ${item.name}${item.dryRun ? " dry-run" : ""}`, { skip: !LIVE }, async () => {
    assert.ok(process.env.FLATKEY_API_KEY, "FLATKEY_API_KEY is required");
    const outDir = await mkdtemp(join(tmpdir(), "flatkey-live-"));
    const args = [...item.args, "--out", outDir];
    if (item.dryRun) args.push("--dry-run");
    const result = await runCli(args);
    const payload = JSON.parse(result.stdout);
    item.expect(payload);
  });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: {
        ...process.env,
        FLATKEY_API_KEY: process.env.FLATKEY_API_KEY,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited ${code}\nstdout:${stdout}\nstderr:${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
