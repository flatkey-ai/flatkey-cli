import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeModels } from "../src/models.js";

test("returns empty list for empty model registry responses", () => {
  assert.deepEqual(normalizeModels({ data: [] }), []);
  assert.deepEqual(normalizeModels({ models: [] }, "video"), []);
  assert.deepEqual(normalizeModels({}, "image"), []);
});

test("normalizes remote model arrays", () => {
  const models = normalizeModels({
    data: [
      { id: "img-x", type: "image" },
      { id: "vid-x", capabilities: ["video"] },
    ],
  });

  assert.deepEqual(models, [
    { id: "img-x", type: "image", source: "remote" },
    { id: "vid-x", type: "video", source: "remote" },
  ]);
});

test("normalizes OpenAI model list response from /v1/models", () => {
  const models = normalizeModels({
    object: "list",
    data: [
      { id: "gpt-5.5", object: "model" },
      { id: "seedance2", object: "model" },
      { id: "gpt-image-2", object: "model" },
      { id: "nano-banana-pro-preview", object: "model" },
    ],
  });

  assert.deepEqual(models, [
    { id: "gpt-5.5", type: "text", source: "remote" },
    { id: "seedance2", type: "video", source: "remote" },
    { id: "gpt-image-2", type: "image", source: "remote" },
    { id: "nano-banana-pro-preview", type: "image", source: "remote" },
  ]);
});
