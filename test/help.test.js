import assert from "node:assert/strict";
import { test } from "node:test";

import { getAiHelp, getHumanHelp } from "../src/help.js";

test("ai help teaches agents setup and command usage", () => {
  const help = getAiHelp();

  assert.match(help, /FLATKEY_API_KEY/);
  assert.match(help, /flatkey onboard --api-key/);
  assert.match(help, /flatkey image generate/);
  assert.match(help, /flatkey video generate/);
  assert.match(help, /flatkey audio generate/);
  assert.match(help, /flatkey credits --json/);
  assert.match(help, /flatkey status --json/);
  assert.match(help, /flatkey models --json/);
  assert.match(help, /JSON mode/);
  assert.match(help, /Missing key/);
});

test("human help lists core commands", () => {
  const help = getHumanHelp();

  assert.match(help, /Usage: flatkey/);
  assert.match(help, /image generate/);
  assert.match(help, /models/);
});
