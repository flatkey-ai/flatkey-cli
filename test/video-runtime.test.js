import assert from "node:assert/strict";
import { test } from "node:test";

import { runtimePlatform } from "../src/video-runtime.js";

test("video runtime maps supported node platforms to release targets", () => {
  assert.equal(runtimePlatform("darwin", "arm64"), "darwin-arm64");
  assert.equal(runtimePlatform("darwin", "x64"), "darwin-x64");
  assert.equal(runtimePlatform("linux", "x64"), "linux-x64");
  assert.equal(runtimePlatform("win32", "arm64"), "win32-arm64");
  assert.throws(() => runtimePlatform("freebsd", "x64"), /Unsupported/);
});
