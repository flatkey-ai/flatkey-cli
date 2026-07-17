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
