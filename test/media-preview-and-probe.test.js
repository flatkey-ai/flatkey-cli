import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { main, parseArgv, runCommand } from "../src/cli.js";

const isolated = {
  env: {},
  configDir: fileURLToPath(new URL("./fixtures/no-config/", import.meta.url)),
};
const signedUrl = "https://objects.test/download?signature=test";

test("human dry-run with remote media skips both the probe and the update lookup", async (t) => {
  const fetch = t.mock.fn(() => { throw new Error("Unexpected network request"); });
  let stdout = "";
  await main([
    "image", "generate", "--model", "gemini-2.5-flash-image", "--prompt", "poster",
    "--image-url", signedUrl, "--dry-run",
  ], {
    ...isolated,
    fetch,
    stdout: { write(chunk) { stdout += chunk; } },
    stderr: { write() {} },
  });
  assert.equal(fetch.mock.callCount(), 0);
  assert.match(stdout, /Dry run: image/);
  assert.ok(stdout.includes(signedUrl));
  assert.match(stdout, /MIME.*submission/i);
});

test("video dry-run previews first and last frames without uploading or fetching them", async (t) => {
  const fetch = t.mock.fn(() => { throw new Error("Unexpected network request"); });
  const result = await runCommand(parseArgv([
    "video", "generate", "--model", "seedance-2-5-pro", "--first-frame", "opening.jpg",
    "--last-frame-url", signedUrl, "--dry-run",
  ]), { ...isolated, fetch });
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(result.request.body.content, [
    { type: "image_url", image_url: { url: "<upload: opening.jpg>" }, role: "first_frame" },
    { type: "image_url", image_url: { url: signedUrl }, role: "last_frame" },
  ]);
});

test("image upload previews its multipart file without an API key or file read", async (t) => {
  const fetch = t.mock.fn(() => { throw new Error("Unexpected upload"); });
  const preview = await runCommand(parseArgv([
    "image", "upload", "--file", "planned.png", "--console-url", "https://console.test", "--dry-run",
  ]), { ...isolated, fetch });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.request.method, "POST");
  assert.equal(preview.request.url, "https://console.test/v1/temp-media/images");
  assert.deepEqual(preview.request.body, { file: "planned.png", contentType: "image/png" });
});

test("video copy previews the derived depth video without running the video helper", async (t) => {
  const fetch = t.mock.fn(() => { throw new Error("Unexpected network request"); });
  const prepareVideoCopy = t.mock.fn(() => { throw new Error("Unexpected video processing"); });
  const preview = await runCommand(parseArgv([
    "video", "copy", "--model", "seedance-2-5-pro", "--source", "planned.mov", "--dry-run",
  ]), { ...isolated, fetch, prepareVideoCopy });
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(prepareVideoCopy.mock.callCount(), 0);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.videoCopy.source, "planned.mov");
  assert.equal(preview.request.body.duration, "<source duration>");
  assert.equal(preview.request.body.content.at(-1).role, "reference_video");
});

function generateWithReference(out, fetch) {
  return runCommand(parseArgv([
    "image", "generate", "--model", "gemini-2.5-flash-image", "--prompt", "poster",
    "--api-key", "test-key", "--base-url", "https://router.test", "--out", out,
    "--image-url", signedUrl, "--json",
  ]), { ...isolated, fetch });
}

test("a supported HEAD response goes straight to image generation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-media-head-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const methods = [];
  await generateWithReference(dir, async (_url, init) => {
    methods.push(init.method);
    if (init.method === "HEAD") {
      return new Response(null, { headers: { "content-type": "image/jpeg; charset=binary" } });
    }
    assert.equal(JSON.parse(init.body).contents[0].parts[1].fileData.mimeType, "image/jpeg");
    return Response.json({ data: [{ url: "https://objects.test/result.jpg" }] });
  });
  assert.deepEqual(methods, ["HEAD", "POST"]);
});

test("live preparation probes a GET-only signed URL with a bounded range and preserves its MIME", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-media-probe-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const methods = [];
  let cancelled = false;
  const result = await generateWithReference(dir, async (url, init) => {
    methods.push(init.method);
    if (init.method === "HEAD") {
      return new Response(null, { status: 403, headers: { "content-type": "application/xml" } });
    }
    if (init.method === "GET") {
      assert.equal(url, signedUrl);
      assert.equal(init.headers.Range, "bytes=0-65535");
      const stream = new ReadableStream({
        start(controller) {
          const chunk = new Uint8Array(128 * 1024);
          chunk.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
          controller.enqueue(chunk);
        },
        cancel() { cancelled = true; },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "application/octet-stream" } });
    }
    assert.deepEqual(JSON.parse(init.body).contents[0].parts[1], {
      fileData: { mimeType: "image/png", fileUri: signedUrl },
    });
    return Response.json({ data: [{ url: "https://objects.test/result.png" }] });
  });
  assert.deepEqual(methods, ["HEAD", "GET", "POST"]);
  assert.equal(cancelled, true);
  assert.equal(result.artifacts.length, 1);
});

test("expired media reports the GET status and stops before generation", async () => {
  const methods = [];
  await assert.rejects(generateWithReference(".", async (_url, init) => {
    methods.push(init.method);
    return new Response(null, { status: 403, headers: { "content-type": "application/xml" } });
  }), /HTTP 403/);
  assert.deepEqual(methods, ["HEAD", "GET"]);
});

test("a throttled signed URL probe retries only the media read before submitting once", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-media-retry-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const methods = [];
  await generateWithReference(dir, async (_url, init) => {
    methods.push(init.method);
    if (init.method === "HEAD") return new Response(null, { status: 403 });
    if (init.method === "GET" && methods.length === 2) {
      return new Response(null, { status: 429, headers: { "retry-after": "0" } });
    }
    if (init.method === "GET") return new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    return Response.json({ data: [{ url: "https://objects.test/result.png" }] });
  });
  assert.deepEqual(methods, ["HEAD", "GET", "GET", "POST"]);
});

test("GET probe rejects an XML error body even when its header claims an image", async () => {
  await assert.rejects(generateWithReference(".", async (_url, init) => {
    if (init.method === "HEAD") throw new Error("HEAD unsupported");
    return new Response("<Error>AccessDenied</Error>", { headers: { "content-type": "image/png" } });
  }), /Unsupported --image-url MIME type/);
});

test("a similar MIME name and an empty GET body cannot validate a reference", async () => {
  const methods = [];
  await assert.rejects(generateWithReference(".", async (_url, init) => {
    methods.push(init.method);
    if (init.method === "HEAD") {
      return new Response(null, { headers: { "content-type": "image/png-preview" } });
    }
    return new Response(null, { status: 204, headers: { "content-type": "image/png" } });
  }), /Unsupported --image-url MIME type/);
  assert.deepEqual(methods, ["HEAD", "GET"]);
});
