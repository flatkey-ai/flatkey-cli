#!/usr/bin/env node
import { ensureVideoRuntime } from "../src/video-runtime.js";

try {
  await ensureVideoRuntime();
} catch (error) {
  const message = error?.message ?? String(error);
  if (process.env.FLATKEY_VIDEO_RUNTIME_REQUIRED === "1") {
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`Flatkey video runtime not installed during postinstall: ${message}\n`);
  }
}
