import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { planImageRequest } from "../src/api.js";
import { runCommand } from "../src/cli.js";
import { imageModelFamily } from "../src/models.js";

const prompt = "draw a cup";
const references = ["https://storage.test/first.jpg", "https://storage.test/second.png"];

test("routes only known image model families", () => {
  for (const [id, family] of [
    ["gpt-image-2.6", "gpt"], ["chatgpt-image-latest", "gpt"],
    ["nano-banana-pro-preview", "gemini"], ["gemini-3.1-flash-image-preview", "gemini"],
    ["dola-seedream-5-0-pro-260628", "seedream"], ["doubao-seedream-4-5", "seedream"],
    ["bytedance-seedream-5-0", "seedream"], ["bytedance/seedream-4-5", "seedream"],
    ["grok-imagine-image-2.0", "grok"], ["grok-2-image-1212", "grok"],
    ["gpt-5.5", undefined], ["gemini-3-pro", undefined], ["grok-4", undefined],
    ["grok-imagine-video", undefined], ["unknown-image", undefined],
  ]) assert.equal(imageModelFamily(id), family, id);
  assert.throws(() => planImageRequest({ model: "unknown-image", prompt }), { code: "unsupported_image_model" });
});

test("Seedream generates and edits on generations with ordered references", () => {
  const model = "seedream-5-0-pro";
  const text = planImageRequest({ model, prompt });
  assert.equal(new URL(text.url).pathname, "/v1/images/generations");
  assert.deepEqual(text.body, { model, prompt, response_format: "url" });
  const edit = planImageRequest({ model, prompt, size: "2K", image_url: references, output_format: "png" });
  assert.equal(new URL(edit.url).pathname, "/v1/images/generations");
  assert.deepEqual(edit.body, { model, prompt, image: references, size: "2K", output_format: "png", response_format: "url" });
  assert.throws(() => planImageRequest({ model, prompt, n: "2" }), /--n/);
  assert.throws(() => planImageRequest({ model, prompt, quality: "high" }), /--quality/);
  assert.throws(() => planImageRequest({ model, prompt, output_format: "gif" }), /--output-format/);
  assert.throws(() => planImageRequest({ model, prompt, temp_url: true }), /temp_url/);
  assert.throws(() => planImageRequest({ model: "seedream-4-5-251128", prompt, output_format: "png" }), /--output-format/);
});

test("Gemini passes native image sizes and rejects unsupported generation controls", () => {
  const options = { model: "gemini-3-pro-image-preview", prompt };
  assert.equal(planImageRequest({ ...options, size: "2k" }).body.generationConfig.imageConfig.imageSize, "2K");
  assert.equal(planImageRequest({ ...options, size: "3:2" }).body.generationConfig.imageConfig.aspectRatio, "3:2");
  assert.throws(() => planImageRequest({ ...options, size: "unlimited" }), /--size/);
  assert.throws(() => planImageRequest({ ...options, quality: "high" }), /--quality/);
  assert.throws(() => planImageRequest({ ...options, n: "2" }), /--n/);
});

test("Grok uses native generation and separate single- and multi-image edits", () => {
  const model = "grok-imagine-image-2.0";
  const text = planImageRequest({ model, prompt, n: "2", size: "2K", quality: "medium" });
  assert.equal(new URL(text.url).pathname, "/v1/images/generations");
  assert.deepEqual(text.body, { model, prompt, n: 2, resolution: "2k", quality: "medium", response_format: "url" });
  const image = { type: "image_url", url: references[0] };
  const single = planImageRequest({ model, prompt, image_url: references[0] });
  assert.equal(new URL(single.url).pathname, "/v1/images/edits");
  assert.deepEqual(single.body, { model, prompt, image, response_format: "url" });
  const many = planImageRequest({ model, prompt, image_url: references });
  assert.deepEqual(many.body.images, [image, { type: "image_url", url: references[1] }]);
  const five = Array.from({ length: 5 }, (_, i) => `https://cdn.test/${i}.png`);
  assert.deepEqual(planImageRequest({ model, prompt, image_url: five }).body.images.map((entry) => entry.url), five);
  assert.throws(() => planImageRequest({ model, prompt, image_url: [...five, references[0]] }), /maximum 5/);
  assert.equal(planImageRequest({ model, prompt, quality: "auto" }).body.quality, undefined);
  assert.throws(() => planImageRequest({ model, prompt, size: "512x512" }), /size|resolution/i);
});

test("Grok preflight distinguishes legacy generation, Imagine edits and 2.0 quality", () => {
  const legacy = { model: "grok-2-image-1212", prompt };
  assert.deepEqual(planImageRequest(legacy).body, { ...legacy, response_format: "url" });
  assert.throws(() => planImageRequest({ ...legacy, image_url: references }), /reference images/i);
  assert.throws(() => planImageRequest({ ...legacy, size: "2K" }), /--size/);
  assert.throws(() => planImageRequest({ ...legacy, quality: "medium" }), /--quality/);
  const imagine = { model: "grok-imagine-image-pro", prompt, image_url: references, size: "1K" };
  assert.equal(planImageRequest(imagine).body.images.length, 2);
  assert.throws(() => planImageRequest({ ...imagine, quality: "low" }), /grok-imagine-image-2\.0/);
});

async function runImage(t, response, extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-image-result-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { model: "gemini-3.1-flash-image", prompt, out: dir, api_key: "test", json: true, ...extra };
  const run = () => runCommand({ group: "image", action: "generate", options }, {
    configDir: dir, env: {}, fetch: async () => Response.json(response),
  });
  return { dir, run };
}

test("image generation reports prompt and candidate blocks and empty responses", async (t) => {
  for (const [response, code, reason] of [
    [{ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }, "image_generation_blocked", /SAFETY/],
    [{ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }, "image_generation_blocked", /PROHIBITED_CONTENT/],
    [{ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "no image" }] } }] }, "image_no_output", /no image/i],
    [{ data: [] }, "image_no_output", /no image/i],
    [{ data: "The model generated text only" }, "image_no_output", /no image/i],
    [{ data: [{ url: "data:image/png;base64," }] }, "image_no_output", /no image/i],
    [{ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: "YQ==" } }] } }] }, "image_no_output", /no image/i],
  ]) {
    const { dir, run } = await runImage(t, response);
    await assert.rejects(run, (error) => error.code === code && reason.test(error.message));
    assert.deepEqual(await readdir(dir), []);
  }
});

test("Seedream base64 JPEG output uses the detected extension", async (t) => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const { dir, run } = await runImage(t, { data: [{ b64_json: bytes.toString("base64") }] }, { model: "seedream-5-0-pro" });
  assert.deepEqual((await run()).artifacts, [{ path: join(dir, "image-01.jpg") }]);
});

test("concurrent auto-named JPEGs preserve previous images across requested formats", async (t) => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const { dir, run } = await runImage(t, { data: [{ b64_json: bytes.toString("base64") }] }, {
    model: "seedream-5-0-pro", output_format: "png",
  });
  const existing = join(dir, "image-01.jpg");
  await writeFile(existing, "original");
  const results = await Promise.all([run(), run()]);
  assert.deepEqual(results.map((result) => result.artifacts[0].path).sort(), [join(dir, "image-02.jpg"), join(dir, "image-03.jpg")]);
  assert.equal(await readFile(existing, "utf8"), "original");
});

test("one image in a later candidate succeeds and text parts do not consume output names", async (t) => {
  const url = "https://cdn.test/generated.jpg";
  const { run } = await runImage(t, { candidates: [
    { finishReason: "IMAGE_SAFETY", content: { parts: [] } },
    { finishReason: "STOP", content: { parts: [{ text: "here" }, { fileData: { fileUri: url, mimeType: "image/jpeg" } }] } },
  ] });
  assert.deepEqual((await run()).artifacts, [{ url }]);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const second = await runImage(t, { candidates: [{ content: { parts: [
    { text: "here" }, { inline_data: { data: bytes.toString("base64"), mime_type: "image/jpeg" } },
  ] } }] });
  assert.deepEqual((await second.run()).artifacts, [{ path: join(second.dir, "image-01.jpg") }]);
  assert.deepEqual((await second.run()).artifacts, [{ path: join(second.dir, "image-02.jpg") }]);
  assert.deepEqual(await readFile(join(second.dir, "image-01.jpg")), bytes);
});
