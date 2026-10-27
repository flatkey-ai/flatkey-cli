import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgv, runCommand } from "../src/cli.js";
import { planImageRequest } from "../src/api.js";

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SIGNED_URL = "https://bucket.example.com/ref.png?X-Amz-Signature=abc";

function headers(map) {
  return { get: (name) => map[name.toLowerCase()] };
}

function streamResponse(bytes, { status = 206, contentType } = {}) {
  let sent = false;
  let cancelled = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers({ "content-type": contentType }),
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
          async cancel() {
            cancelled = true;
          },
        };
      },
    },
    get cancelled() {
      return cancelled;
    },
  };
}

async function dryRunImageUrl(fetchImpl, url = SIGNED_URL) {
  return runCommand(parseArgv([
    "image",
    "generate",
    "--model",
    "gemini-2.5-flash-image",
    "--prompt",
    "keep the apple",
    "--image-url",
    url,
    "--dry-run",
    "--json",
  ]), { api_key: "key", base_url: "https://router.test", fetch: fetchImpl });
}

test("--image-url falls back to a ranged GET when HEAD is forbidden", async () => {
  const calls = [];
  let getResponse;
  const result = await dryRunImageUrl(async (url, init) => {
    calls.push({ url, method: init?.method, range: init?.headers?.Range });
    if (init?.method === "HEAD") {
      return { ok: false, status: 403, headers: headers({ "content-type": "application/xml" }) };
    }
    getResponse = streamResponse(PNG_HEAD, { contentType: "binary/octet-stream" });
    return getResponse;
  });

  assert.deepEqual(calls.map((call) => call.method), ["HEAD", "GET"]);
  assert.equal(calls[1].range, "bytes=0-65535");
  assert.equal(getResponse.cancelled, true);
  assert.deepEqual(result.request.body.contents[0].parts[1], {
    fileData: { mimeType: "image/png", fileUri: SIGNED_URL },
  });
});

test("--image-url falls back to GET when HEAD throws", async () => {
  const result = await dryRunImageUrl(async (url, init) => {
    if (init?.method === "HEAD") throw new Error("HEAD not allowed");
    return streamResponse(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), { contentType: "image/jpeg" });
  });
  assert.equal(result.request.body.contents[0].parts[1].fileData.mimeType, "image/jpeg");
});

test("--image-url does not issue a GET when HEAD already proves an image", async () => {
  const methods = [];
  await dryRunImageUrl(async (url, init) => {
    methods.push(init?.method);
    return { ok: true, status: 200, headers: headers({ "content-type": "image/png" }) };
  });
  assert.deepEqual(methods, ["HEAD"]);
});

test("--image-url still rejects a URL whose bytes are not an image", async () => {
  await assert.rejects(
    () => dryRunImageUrl(async (url, init) => {
      if (init?.method === "HEAD") {
        return { ok: false, status: 403, headers: headers({ "content-type": "application/xml" }) };
      }
      return streamResponse(Buffer.from("<?xml version=\"1.0\"?><Error>AccessDenied</Error>"), { status: 403, contentType: "application/xml" });
    }),
    /Unsupported --image-url MIME type .*application\/xml/,
  );
});

test("--image-url rejects an XML error body even when Content-Type claims an image", async () => {
  await assert.rejects(
    () => dryRunImageUrl(async (url, init) => {
      if (init?.method === "HEAD") return { ok: false, status: 405, headers: headers({}) };
      return streamResponse(Buffer.from("<Error>expired</Error>"), { status: 200, contentType: "image/png" });
    }),
    /Unsupported --image-url MIME type/,
  );
});

test("gemini image request maps --size to imageConfig", () => {
  const plan = (size) => planImageRequest({ apiKey: "key", model: "gemini-3-pro-image", prompt: "p", size }).body.generationConfig;
  assert.deepEqual(plan("2:3"), { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "2:3" } });
  assert.deepEqual(plan("1024x1536"), { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "2:3" } });
  assert.deepEqual(plan("2k"), { responseModalities: ["TEXT", "IMAGE"], imageConfig: { imageSize: "2K" } });
  assert.equal(plan(undefined), undefined);
  assert.equal(plan("1408x768"), undefined);
});
