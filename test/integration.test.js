import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
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
      response.setHeader("content-type", "application/json");
      if (request.url.startsWith("/v1beta/models/")) {
        response.end(JSON.stringify({ data: [{ url: "https://cdn.test/image.png" }] }));
      } else if (request.url === "/v1/videos/generations") {
        response.end(JSON.stringify({ data: [{ url: "https://cdn.test/video.mp4" }] }));
      } else if (request.url === "/v1/audio/generations") {
        response.end(JSON.stringify({ data: [{ url: "https://cdn.test/audio.mp3" }] }));
      } else if (request.url === "/v1/credits") {
        response.end(JSON.stringify({ remaining: 42, used: 8 }));
      } else if (request.url === "/v1/status") {
        response.end(JSON.stringify({ status: "ok" }));
      } else if (request.url === "/v1/models") {
        response.end(JSON.stringify({ data: [{ id: "remote-image", type: "image" }] }));
      } else {
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
  const credits = await runCli(["credits", ...common]);
  const status = await runCli(["status", ...common]);
  const models = await runCli(["models", ...common]);

  assert.deepEqual(JSON.parse(image.stdout).artifacts, [{ url: "https://cdn.test/image.png" }]);
  assert.deepEqual(JSON.parse(video.stdout).artifacts, [{ url: "https://cdn.test/video.mp4" }]);
  assert.deepEqual(JSON.parse(audio.stdout).artifacts, [{ url: "https://cdn.test/audio.mp3" }]);
  assert.equal(JSON.parse(credits.stdout).remaining, 42);
  assert.equal(JSON.parse(status.stdout).status, "ok");
  assert.deepEqual(JSON.parse(models.stdout).models, [
    { id: "remote-image", type: "image", source: "remote" },
  ]);
  assert.equal(image.stderr, "");
  assert.ok(requests.some((request) => request.url.startsWith("/v1beta/models/")));
  assert.ok(requests.some((request) => request.url === "/v1/videos/generations"));
  assert.ok(requests.some((request) => request.url === "/v1/audio/generations"));
});

test("prints json errors to stderr in json mode", async () => {
  const result = await runCliAllowFailure(["credits", "--json"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    error: {
      message: "Missing Flatkey API key. Run `flatkey onboard --api-key <key>` or set FLATKEY_API_KEY.",
    },
  });
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, FLATKEY_API_KEY: "" },
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

function runCliAllowFailure(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, FLATKEY_API_KEY: "" },
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
