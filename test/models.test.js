import assert from "node:assert/strict";
import { test } from "node:test";

import { getBundledModels, normalizeModels } from "../src/models.js";

test("returns bundled fallback models with source marker", () => {
  const models = getBundledModels();

  assert.ok(models.some((model) => model.id === "nano-banana-pro-preview"));
  assert.ok(models.some((model) => model.id === "seedance2"));
  assert.ok(models.some((model) => model.id === "gpt-5.5"));
  assert.ok(models.some((model) => model.type === "video"));
  assert.ok(models.some((model) => model.type === "text"));
  assert.ok(models.some((model) => model.type === "audio"));
  assert.equal(models[0].source, "bundled");
});

test("filters bundled models by type", () => {
  const models = getBundledModels("image");

  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model.type === "image"));
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
