import { access, mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export const MIN_COPY_DURATION_SECONDS = 5;
export const MAX_COPY_DURATION_SECONDS = 15;
export const DEFAULT_FRAME_RATIO = 100;
export const DEFAULT_DEPTH_RESOLUTION = "480p";

export async function prepareVideoCopy(options, deps = {}) {
  const source = await expandHomePath(options.source);
  const sourceInfo = await inspectVideo(source, deps);
  const duration = sourceInfo.duration;
  validateCopyDuration(duration, "source video");

  const requestedDuration = options.duration === undefined
    ? duration
    : parseDuration(options.duration, "--duration");
  validateCopyDuration(requestedDuration, "--duration");
  if (Math.abs(requestedDuration - duration) > 0.01) {
    throw new Error(
      `--duration must match the source video duration (${formatSeconds(duration)}s); time stretching is not supported by video copy.`,
    );
  }

  const depthRoot = await resolveDepthLocation(options.depth_location, deps);
  const workDir = join(depthRoot, `copy-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(workDir, { recursive: true });
  const depthPath = join(workDir, "depth.mp4");
  let helperResult;
  try {
    helperResult = await runDepthHelper({
      source,
      output: depthPath,
      frameRatio: parseFrameRatio(options.frame_ratio),
      resolution: parseDepthResolution(options.depth_resolution),
      model: options.depth_model,
      workDir,
    }, deps);
  } catch (error) {
    if (!options.keep_depth) await rm(workDir, { recursive: true, force: true });
    throw error;
  }
  let referencePaths;
  try {
    referencePaths = await (deps.extractReferenceFrames ?? extractReferenceFrames)({
      source: helperResult.output ?? depthPath,
      outputDir: workDir,
      duration,
      ffmpegPath: deps.ffmpegPath,
      env: deps.env,
    }, deps);
  } catch (error) {
    if (!options.keep_depth) await rm(workDir, { recursive: true, force: true });
    throw error;
  }

  return {
    source,
    depthPath: helperResult.output ?? depthPath,
    referencePaths,
    workDir,
    duration: requestedDuration,
    sourceInfo,
    helper: helperResult,
    cleanup: async () => {
      if (!options.keep_depth) {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}

export function validateCopyDuration(value, label = "duration") {
  const duration = parseDuration(value, label);
  if (duration < MIN_COPY_DURATION_SECONDS || duration > MAX_COPY_DURATION_SECONDS) {
    throw new Error(
      `${label} must be between ${MIN_COPY_DURATION_SECONDS} and ${MAX_COPY_DURATION_SECONDS} seconds; received ${formatSeconds(duration)}s.`,
    );
  }
  return duration;
}

export function parseDuration(value, label = "duration") {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${label} must be a positive number of seconds.`);
  }
  return duration;
}

export function parseFrameRatio(value = DEFAULT_FRAME_RATIO) {
  const ratio = Number(value);
  if (!Number.isInteger(ratio) || ratio < 20 || ratio > 100) {
    throw new Error("--frame-ratio must be an integer between 20 and 100.");
  }
  return ratio;
}

export function parseDepthResolution(value = DEFAULT_DEPTH_RESOLUTION) {
  const normalized = String(value).toLowerCase();
  if (normalized === "original" || normalized === "480" || normalized === "480p") return normalized === "original" ? "original" : "480p";
  if (normalized === "320" || normalized === "320p") return "320p";
  throw new Error("--depth-resolution must be original, 480p, or 320p.");
}

export async function resolveDepthLocation(value, deps = {}) {
  const candidates = [
    value,
    deps.tmpdir,
    tmpdir(),
    join(homedir(), ".tmp"),
    join(process.cwd(), ".flatkey-tmp"),
  ].filter(Boolean);

  let lastError;
  for (const candidate of candidates) {
    const expanded = await expandHomePath(candidate);
    try {
      await mkdir(expanded, { recursive: true });
      await access(expanded);
      return join(expanded, "flatkey-video-copy");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to create a writable depth-video directory${lastError ? `: ${lastError.message}` : "."}`);
}

export async function inspectVideo(source, deps = {}) {
  const ffprobe = deps.ffprobePath ?? "ffprobe";
  const result = await runProcess(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=width,height,avg_frame_rate",
    "-of", "json",
    source,
  ], deps);
  let metadata;
  try {
    metadata = JSON.parse(result.stdout);
  } catch {
    throw new Error(`ffprobe returned invalid metadata for ${source}.`);
  }
  const duration = Number(metadata?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to read source video duration: ${source}`);
  }
  return {
    duration,
    width: Number(metadata?.streams?.[0]?.width) || undefined,
    height: Number(metadata?.streams?.[0]?.height) || undefined,
    frameRate: metadata?.streams?.[0]?.avg_frame_rate,
  };
}

export async function runDepthHelper(options, deps = {}) {
  let helper = deps.depthHelperPath ?? deps.env?.FLATKEY_DEPTH_HELPER ?? process.env.FLATKEY_DEPTH_HELPER;
  if (!helper) {
    const { ensureVideoRuntime } = await import("./video-runtime.js");
    helper = (await ensureVideoRuntime({
      env: deps.env,
      fetch: deps.fetch,
      platform: deps.platform,
      arch: deps.arch,
    })).helperPath;
  }

  const args = [
    "--source", options.source,
    "--output", options.output,
    "--frame-ratio", String(options.frameRatio),
    "--resolution", options.resolution,
    "--work-dir", options.workDir,
  ];
  if (options.model) args.push("--model", options.model);
  const result = await runProcess(helper, args, deps);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("The Flatkey Rust depth helper returned invalid JSON.");
  }
}

export async function extractReferenceFrames(options, deps = {}) {
  const ffmpeg = options.ffmpegPath
    ?? deps.env?.FFMPEG_PATH
    ?? process.env.FFMPEG_PATH
    ?? "ffmpeg";
  const duration = Number(options.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Cannot extract depth reference frames without a valid duration.");
  }

  await mkdir(options.outputDir, { recursive: true });
  const timestamps = [
    0,
    duration / 2,
    Math.max(0, duration - 1 / 30),
  ];
  const paths = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const output = join(options.outputDir, `depth-frame-${String(index + 1).padStart(2, "0")}.png`);
    await runProcess(ffmpeg, [
      "-v", "error",
      "-y",
      "-ss", timestamps[index].toFixed(6),
      "-i", options.source,
      "-frames:v", "1",
      output,
    ], deps);
    paths.push(output);
  }
  return paths;
}

export function runProcess(command, args, deps = {}) {
  if (deps.runProcess) return deps.runProcess(command, args);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: deps.cwd,
      env: deps.env ?? process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      reject(new Error(`Failed to start ${command}: ${error.message}`));
    });
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(`${command} failed with exit code ${code}${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
    });
  });
}

async function expandHomePath(value) {
  if (typeof value !== "string") return value;
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function formatSeconds(value) {
  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}
