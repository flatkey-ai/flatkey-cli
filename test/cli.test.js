import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("rejects unknown options with command help hint", () => {
  assert.throws(
    () => parseArgv(["image", "generate", "--prompt", "x", "--ouput", "out.png"]),
    /Unknown option --ouput.*flatkey image generate --help/,
  );
  assert.throws(
    () => parseArgv(["credits", "--prompt", "x"]),
    /Unknown option --prompt.*flatkey credits --help/,
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

test("parses browser login commands", () => {
  assert.deepEqual(parseArgv(["login", "--no-open", "--console-url", "https://console.test"]), {
    group: "login",
    action: undefined,
    options: {
      no_open: true,
      console_url: "https://console.test",
    },
  });
  assert.deepEqual(parseArgv(["auth", "status", "--json"]), {
    group: "auth",
    action: "status",
    options: {
      json: true,
    },
  });
  assert.deepEqual(parseArgv(["logout"]), {
    group: "logout",
    action: undefined,
    options: {},
  });
});

test("browser login prints approval URL and saves returned API key", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));
  const fetchCalls = [];
  let stdout = "";
  const result = await runCommand({
    group: "login",
    action: undefined,
    options: {
      no_open: true,
      console_url: "https://console.test",
    },
  }, {
    configDir,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    sleep: async () => {},
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      if (url === "https://console.test/api/cli/device_authorizations") {
        return jsonResponse({
          device_code: "device-code",
          verification_uri_complete: "https://console.test/cli/authorize?user_code=ABCD-EFGH",
          expires_in: 600,
          interval: 5,
        });
      }
      return jsonResponse({
        status: "approved",
        api_key: "sk-login",
        token_id: 9,
        user_id: 7,
      });
    },
  });

  assert.match(stdout, /https:\/\/console\.test\/cli\/authorize\?user_code=ABCD-EFGH/);
  assert.match(result, /Flatkey CLI authorized/);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, "https://console.test/api/cli/device_authorizations");
  assert.equal(fetchCalls[1].url, "https://console.test/api/cli/device_authorizations/token");

  const saved = JSON.parse(await readFile(join(configDir, "config.json"), "utf8"));
  assert.equal(saved.apiKey, "sk-login");
  assert.equal(saved.auth.type, "device");
  assert.equal(saved.auth.userId, 7);
  assert.equal(saved.auth.tokenId, 9);
  assert.equal(typeof saved.auth.deviceId, "string");
});

test("origin env vars switch router and console APIs", async () => {
  const video = await runCommand({
    group: "video",
    action: "generate",
    options: {
      prompt: "clip",
      dry_run: true,
      json: true,
    },
  }, {
    env: {
      ROUTER_ORIGIN: "https://staging-router.test",
      CONSOLE_ORIGIN: "https://staging-console.test",
    },
  });
  assert.equal(video.request.url, "https://staging-router.test/v1/video/generations");

  const fetchCalls = [];
  await runCommand({
    group: "credits",
    action: undefined,
    options: { api_key: "key" },
  }, {
    env: { CONSOLE_ORIGIN: "https://staging-console.test" },
    fetch: async (url) => {
      fetchCalls.push(url);
      return jsonResponse({});
    },
  });
  assert.equal(fetchCalls[0], "https://staging-console.test/v1/credits");
});

test("command origins override origin env vars", async () => {
  const image = await runCommand({
    group: "image",
    action: "generate",
    options: {
      prompt: "poster",
      model: "gpt-image-2",
      base_url: "https://router.flag",
      dry_run: true,
    },
  }, {
    env: { ROUTER_ORIGIN: "https://router.env" },
  });

  assert.equal(image.request.url, "https://router.flag/v1/images/generations");
});

test("auth status masks saved key and logout removes only key", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));
  await runCommand({
    group: "login",
    action: undefined,
    options: {
      json: true,
      no_open: true,
      console_url: "https://console.test",
    },
  }, {
    configDir,
    sleep: async () => {},
    fetch: async (url) => url.endsWith("/token")
      ? jsonResponse({ status: "approved", api_key: "sk-login-secret", token_id: 9, user_id: 7 })
      : jsonResponse({
        device_code: "device-code",
        verification_uri_complete: "https://console.test/cli/authorize?user_code=ABCD-EFGH",
        expires_in: 600,
        interval: 5,
      }),
  });

  const status = await runCommand({
    group: "auth",
    action: "status",
    options: { json: true },
  }, {
    configDir,
    env: {},
  });
  assert.equal(status.authenticated, true);
  assert.equal(status.source, "config");
  assert.equal(status.key, "sk-log...cret");

  await runCommand({ group: "logout", action: undefined, options: {} }, { configDir });
  const afterLogout = await runCommand({
    group: "auth",
    action: "status",
    options: { json: true },
  }, {
    configDir,
    env: {},
  });
  assert.equal(afterLogout.authenticated, false);
  assert.equal(afterLogout.auth?.deviceId, status.auth.deviceId);
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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
