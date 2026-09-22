import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  parseDepthResolution,
  parseFrameRatio,
  prepareVideoCopy,
  validateCopyDuration,
} from "../src/video-copy.js";

test("video copy duration is constrained to 5-15 seconds", () => {
  assert.equal(validateCopyDuration(5), 5);
  assert.equal(validateCopyDuration(15), 15);
  assert.throws(() => validateCopyDuration(4.99), /between 5 and 15/);
  assert.throws(() => validateCopyDuration(15.01), /between 5 and 15/);
});

test("video copy validates frame ratio and depth resolution", () => {
  assert.equal(parseFrameRatio(undefined), 100);
  assert.equal(parseFrameRatio("20"), 20);
  assert.equal(parseFrameRatio("100"), 100);
  assert.throws(() => parseFrameRatio("19"), /between 20 and 100/);
  assert.throws(() => parseFrameRatio("80.5"), /integer/);

  assert.equal(parseDepthResolution(undefined), "480p");
  assert.equal(parseDepthResolution("480"), "480p");
  assert.equal(parseDepthResolution("320p"), "320p");
  assert.equal(parseDepthResolution("original"), "original");
  assert.throws(() => parseDepthResolution("720p"), /original, 480p, or 320p/);
});

test("prepareVideoCopy keeps source duration and calls depth helper", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-copy-"));
  const source = join(dir, "source.mp4");
  await writeFile(source, "source-video");
  const calls = [];

  const result = await prepareVideoCopy({
    source,
    frame_ratio: "80",
    depth_resolution: "320p",
    duration: "8.5",
    depth_location: dir,
    keep_depth: true,
  }, {
    runProcess: async (command, args) => {
      calls.push({ command, args });
      if (command === "ffprobe") {
        return {
          stdout: JSON.stringify({
            format: { duration: "8.500000" },
            streams: [{ width: 1280, height: 720, avg_frame_rate: "30/1" }],
          }),
        };
      }
      return { stdout: JSON.stringify({ output: args[3], frames: 255 }) };
    },
    extractReferenceFrames: async ({ outputDir }) => [
      join(outputDir, "depth-frame-01.png"),
      join(outputDir, "depth-frame-02.png"),
      join(outputDir, "depth-frame-03.png"),
    ],
    depthHelperPath: "flatkey-depth-test",
  });

  assert.equal(result.duration, 8.5);
  assert.equal(result.sourceInfo.width, 1280);
  assert.equal(result.referencePaths.length, 3);
  assert.equal(calls[1].command, "flatkey-depth-test");
  assert.deepEqual(calls[1].args.slice(0, 8), [
    "--source",
    source,
    "--output",
    result.depthPath,
    "--frame-ratio",
    "80",
    "--resolution",
    "320p",
  ]);
});

test("extractReferenceFrames samples the depth video at the first, middle, and last moments", async () => {
  const { extractReferenceFrames } = await import("../src/video-copy.js");
  const dir = await mkdtemp(join(tmpdir(), "flatkey-depth-frames-"));
  const calls = [];
  const paths = await extractReferenceFrames({
    source: join(dir, "depth.mp4"),
    outputDir: dir,
    duration: 10,
    ffmpegPath: "ffmpeg-test",
  }, {
    runProcess: async (command, args) => {
      calls.push({ command, args });
      return { stdout: "", stderr: "" };
    },
  });

  assert.deepEqual(paths, [
    join(dir, "depth-frame-01.png"),
    join(dir, "depth-frame-02.png"),
    join(dir, "depth-frame-03.png"),
  ]);
  assert.deepEqual(calls.map((call) => call.args.slice(0, 9)), [
    ["-v", "error", "-y", "-ss", "0.000000", "-i", join(dir, "depth.mp4"), "-frames:v", "1"],
    ["-v", "error", "-y", "-ss", "5.000000", "-i", join(dir, "depth.mp4"), "-frames:v", "1"],
    ["-v", "error", "-y", "-ss", "9.966667", "-i", join(dir, "depth.mp4"), "-frames:v", "1"],
  ]);
});

test("prepareVideoCopy rejects time stretching", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-copy-stretch-"));
  const source = join(dir, "source.mp4");
  await writeFile(source, "source-video");

  await assert.rejects(
    () => prepareVideoCopy({
      source,
      duration: "9",
      depth_location: dir,
    }, {
      runProcess: async () => ({
        stdout: JSON.stringify({ format: { duration: "8.000000" }, streams: [{}] }),
      }),
      depthHelperPath: "flatkey-depth-test",
    }),
    /must match the source video duration/,
  );
});
