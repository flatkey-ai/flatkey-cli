import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { persistArtifacts } from "../src/artifacts.js";

test("saves OpenAI base64 image artifacts", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));

  const artifacts = await persistArtifacts({
    kind: "image",
    response: { data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] },
    outDir,
  });

  assert.equal(artifacts.length, 1);
  assert.match(artifacts[0].path, /image-01\.png$/);
  assert.equal(await readFile(artifacts[0].path, "utf8"), "png-bytes");
});

test("saves data url video artifacts with mime extension", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));

  const artifacts = await persistArtifacts({
    kind: "video",
    response: {
      data: [{ url: `data:video/mp4;base64,${Buffer.from("mp4-bytes").toString("base64")}` }],
    },
    outDir,
  });

  assert.match(artifacts[0].path, /video-01\.mp4$/);
  assert.equal(await readFile(artifacts[0].path, "utf8"), "mp4-bytes");
});

test("preserves remote url artifacts without downloading", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));

  const artifacts = await persistArtifacts({
    kind: "audio",
    response: { data: [{ url: "https://cdn.test/audio.mp3" }] },
    outDir,
  });

  assert.deepEqual(artifacts, [{ url: "https://cdn.test/audio.mp3" }]);
});

test("saves first artifact to explicit output path", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));
  const output = join(outDir, "custom.png");

  const artifacts = await persistArtifacts({
    kind: "image",
    response: { data: [{ b64_json: Buffer.from("custom-bytes").toString("base64") }] },
    output,
  });

  assert.deepEqual(artifacts, [{ path: output }]);
  assert.equal(await readFile(output, "utf8"), "custom-bytes");
});

test("adds numeric suffix for multiple artifacts with explicit output path", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));
  const output = join(outDir, "custom.png");

  const artifacts = await persistArtifacts({
    kind: "image",
    response: {
      data: [
        { b64_json: Buffer.from("one").toString("base64") },
        { b64_json: Buffer.from("two").toString("base64") },
      ],
    },
    output,
  });

  assert.match(artifacts[0].path, /custom\.png$/);
  assert.match(artifacts[1].path, /custom-02\.png$/);
  assert.equal(await readFile(artifacts[1].path, "utf8"), "two");
});

test("downloads remote url artifact when explicit output path is set", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-artifacts-"));
  const output = join(outDir, "clip.mp4");
  const calls = [];

  const artifacts = await persistArtifacts({
    kind: "video",
    response: { data: [{ url: "https://cdn.test/clip.mp4" }] },
    output,
    fetch: async (url) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return Buffer.from("video-bytes");
        },
      };
    },
  });

  assert.deepEqual(calls, ["https://cdn.test/clip.mp4"]);
  assert.deepEqual(artifacts, [{ path: output }]);
  assert.equal(await readFile(output, "utf8"), "video-bytes");
});
