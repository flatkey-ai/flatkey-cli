import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const BIN = new URL("../bin/flatkey.js", import.meta.url).pathname;

test("runs generation and utility commands in json mode", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ url: request.url, method: request.method, body });
      if (request.url.startsWith("/v1beta/models/")) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: [{ url: "https://cdn.test/image.png" }] }));
      } else if (request.url === "/v1/video/generations") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: [{ url: "https://cdn.test/video.mp4" }] }));
      } else if (request.url === "/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL") {
        response.setHeader("content-type", "audio/mpeg");
        response.end("audio-file");
      } else if (request.url === "/v1/chat/completions") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ choices: [{ message: { content: "headline" } }] }));
      } else if (request.url === "/v1/credits") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ remaining: 42, used: 8 }));
      } else if (request.url === "/v1/status") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ status: "ok" }));
      } else if (request.url === "/v1/available_models") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          success: true,
          object: "list",
          data: [{ id: "remote-image", object: "model", owned_by: "flatkey" }],
        }));
      } else if (request.url === "/v1/voices") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ voices: [{ voice_id: "voice-123", name: "Rachel" }] }));
      } else {
        response.setHeader("content-type", "application/json");
        response.statusCode = 404;
        response.end(JSON.stringify({ error: { message: "not found" } }));
      }
    });
  });
  t.after(() => server.close());
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const common = ["--base-url", baseUrl, "--api-key", "test-key", "--json"];
  const image = await runCli(["image", "generate", "--prompt", "poster", ...common]);
  const video = await runCli(["video", "generate", "--prompt", "clip", ...common]);
  const audio = await runCli(["audio", "generate", "--prompt", "voice", ...common]);
  const text = await runCli(["text", "generate", "--prompt", "headline", ...common]);
  const credits = await runCli(["credits", ...common]);
  const status = await runCli(["status", ...common]);
  const models = await runCli(["models", ...common]);
  const voices = await runCli(["audio", "voices", ...common]);

  assert.deepEqual(JSON.parse(image.stdout).artifacts, [{ url: "https://cdn.test/image.png" }]);
  assert.deepEqual(JSON.parse(video.stdout).artifacts, [{ url: "https://cdn.test/video.mp4" }]);
  assert.equal(JSON.parse(audio.stdout).artifacts.length, 1);
  assert.match(JSON.parse(audio.stdout).artifacts[0].path, /audio-01\.mp3$/);
  assert.equal(JSON.parse(text.stdout).text, "headline");
  assert.equal(JSON.parse(credits.stdout).remaining, 42);
  assert.equal(JSON.parse(status.stdout).status, "ok");
  assert.deepEqual(JSON.parse(models.stdout).models, [
    { id: "remote-image", type: "image", source: "remote" },
  ]);
  assert.deepEqual(JSON.parse(voices.stdout).voices, [{ voice_id: "voice-123", name: "Rachel" }]);
  assert.equal(image.stderr, "");
  assert.ok(requests.some((request) => request.url.startsWith("/v1beta/models/")));
  assert.ok(requests.some((request) => request.url === "/v1/video/generations"));
  assert.ok(requests.some((request) => request.url === "/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL"));
  assert.ok(requests.some((request) => request.url === "/v1/chat/completions"));
});

test("credits and status normalize missing token API errors", async (t) => {
  const server = createServer((request, response) => {
    request.on("data", () => {});
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.statusCode = 401;
      response.end(JSON.stringify({ message: "Token not provided" }));
    });
  });
  t.after(() => server.close());
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const common = ["--base-url", baseUrl, "--api-key", "test-key"];
  const credits = await runCliAllowFailure(["credits", ...common]);
  const status = await runCliAllowFailure(["status", ...common]);

  assert.equal(credits.code, 1);
  assert.equal(status.code, 1);
  assert.match(credits.stderr, /Missing Flatkey API key/);
  assert.match(status.stderr, /Missing Flatkey API key/);
  assert.doesNotMatch(credits.stderr, /Token not provided/);
  assert.doesNotMatch(status.stderr, /Token not provided/);
});

test("dry-run returns planned request without calling network", async () => {
  const result = await runCli([
    "video",
    "generate",
    "--prompt", "clip",
    "--ratio", "21:9",
    "--resolution", "1080p",
    "--dry-run",
    "--json",
  ]);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.kind, "video");
  assert.equal(payload.request.url, "https://router.flatkey.ai/v1/video/generations");
  assert.equal(payload.request.body.ratio, "21:9");
  assert.equal(payload.request.body.aspect, "21:9");
  assert.equal(payload.request.body.resolution, "1080p");
  assert.equal(payload.request.body.quality, "1080p");
  assert.equal(result.stderr, "");
});

test("audio dry-run supports tts, sfx, and music routes", async () => {
  const tts = await runCli([
    "audio",
    "generate",
    "--prompt",
    "hello",
    "--voice-id",
    "voice-123",
    "--dry-run",
    "--json",
  ]);
  const sfx = await runCli([
    "audio",
    "sfx",
    "--prompt",
    "glass shattering",
    "--duration",
    "3",
    "--dry-run",
    "--json",
  ]);
  const music = await runCli([
    "audio",
    "music",
    "--prompt",
    "calm ambient piano",
    "--music-length-ms",
    "10000",
    "--dry-run",
    "--json",
  ]);

  assert.equal(JSON.parse(tts.stdout).request.url, "https://router.flatkey.ai/v1/text-to-speech/voice-123");
  assert.equal(JSON.parse(sfx.stdout).request.url, "https://router.flatkey.ai/v1/sound-generation");
  assert.equal(JSON.parse(sfx.stdout).request.body.duration_seconds, 3);
  assert.equal(JSON.parse(music.stdout).request.url, "https://router.flatkey.ai/v1/music");
  assert.equal(JSON.parse(music.stdout).request.body.music_length_ms, 10000);
});

test("per-command help prints usage without api key", async () => {
  const video = await runCli(["video", "generate", "--help"]);
  const status = await runCli(["status", "--help"]);
  const helpTopic = await runCli(["help", "models"]);

  assert.match(video.stdout, /Usage: flatkey video generate/);
  assert.match(video.stdout, /--resolution/);
  assert.match(status.stdout, /Usage: flatkey status/);
  assert.match(helpTopic.stdout, /Usage: flatkey models/);
  assert.equal(video.stderr, "");
  assert.equal(status.stderr, "");
  assert.equal(helpTopic.stderr, "");
});

test("generation commands write explicit output files", async (t) => {
  const server = createServer((request, response) => {
    request.on("data", () => {});
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/images/generations") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          data: [{ b64_json: Buffer.from("image-file").toString("base64") }],
        }));
      } else if (request.url === "/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL") {
        response.setHeader("content-type", "audio/mpeg");
        response.end("audio-file");
      } else if (request.url === "/v1/chat/completions") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ choices: [{ message: { content: "text-file" } }] }));
      } else {
        response.setHeader("content-type", "application/json");
        response.statusCode = 404;
        response.end(JSON.stringify({ error: { message: "not found" } }));
      }
    });
  });
  t.after(() => server.close());
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const dir = await mkdtemp(join(tmpdir(), "flatkey-output-"));
  const imageOutput = join(dir, "poster.png");
  const audioOutput = join(dir, "speech.mp3");
  const textOutput = join(dir, "headline.txt");

  const common = ["--base-url", baseUrl, "--api-key", "test-key", "--json"];
  const image = await runCli([
    "image",
    "generate",
    "--model",
    "gpt-image-2",
    "--prompt",
    "poster",
    "--output",
    imageOutput,
    ...common,
  ]);
  const text = await runCli([
    "text",
    "generate",
    "--prompt",
    "headline",
    "-o",
    textOutput,
    ...common,
  ]);
  const audio = await runCli([
    "audio",
    "generate",
    "--prompt",
    "hello",
    "-o",
    audioOutput,
    ...common,
  ]);

  assert.deepEqual(JSON.parse(image.stdout).artifacts, [{ path: imageOutput }]);
  assert.equal(await readFile(imageOutput, "utf8"), "image-file");
  assert.equal(JSON.parse(image.stdout).response.data[0].b64_json, "<artifact omitted>");
  assert.doesNotMatch(image.stdout, /aW1hZ2UtZmlsZQ==/);
  assert.deepEqual(JSON.parse(audio.stdout).artifacts, [{ path: audioOutput }]);
  assert.equal(await readFile(audioOutput, "utf8"), "audio-file");
  assert.equal(JSON.parse(text.stdout).output, textOutput);
  assert.equal(await readFile(textOutput, "utf8"), "text-file");
});

test("prints json errors to stderr in json mode", async () => {
  const result = await runCliAllowFailure(["credits", "--json"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    error: {
      message: "Missing Flatkey API key. Create one at https://console.flatkey.ai/keys, then run `flatkey onboard --api-key <key>` or set FLATKEY_API_KEY.",
    },
  });
});

test("onboard without api key points user to key creation", async () => {
  const result = await runCliAllowFailure(["onboard", "--api-key"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Missing --api-key value/);
  assert.match(result.stderr, /https:\/\/console\.flatkey\.ai\/keys/);
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function runCli(args) {
  const home = await mkdtemp(join(tmpdir(), "flatkey-home-"));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: cleanCliEnv(home),
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

async function runCliAllowFailure(args) {
  const home = await mkdtemp(join(tmpdir(), "flatkey-home-"));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: cleanCliEnv(home),
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
      resolve({ code, stdout, stderr });
    });
  });
}

function cleanCliEnv(home) {
  return {
    ...process.env,
    CONSOLE_ORIGIN: "",
    FLATKEY_API_KEY: "",
    HOME: home,
    ROUTER_ORIGIN: "",
    USERPROFILE: home,
  };
}
