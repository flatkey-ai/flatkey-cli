import assert from "node:assert/strict";
import { test } from "node:test";

import { createAnimation } from "../src/animation.js";

test("does not animate in json mode", () => {
  let output = "";
  const animation = createAnimation({
    json: true,
    stream: { isTTY: true, write: (chunk) => { output += chunk; } },
  });

  animation.start("image");
  animation.stop();

  assert.equal(output, "");
});

test("uses single log line when stderr is not a tty", () => {
  let output = "";
  const animation = createAnimation({
    json: false,
    stream: { isTTY: false, write: (chunk) => { output += chunk; } },
  });

  animation.start("video");
  animation.stop();

  assert.equal(output, "flatkey video generation started\n");
});
