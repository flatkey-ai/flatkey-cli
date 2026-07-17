import assert from "node:assert/strict";
import { test } from "node:test";

import { getBundledModels, normalizeModels } from "../src/models.js";

test("returns bundled fallback models with source marker", () => {
  const models = getBundledModels();

  assert.ok(models.some((model) => model.id === "nano-banana-pro-preview"));
  assert.ok(models.some((model) => model.type === "video"));
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
