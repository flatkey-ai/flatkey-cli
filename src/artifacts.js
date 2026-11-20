import { mkdir, open, readdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";

import { FlatkeyError, getResponseMetadata, responseError } from "./api.js";
import { CLI_REQUEST_HEADERS } from "./requestHeaders.js";

const DEFAULT_EXTENSIONS = {
  audio: "mp3",
  image: "png",
  video: "mp4",
};

const MIME_EXTENSIONS = {
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

const FORMAT_EXTENSIONS = {
  gif: "gif",
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
};

export async function persistArtifacts({
  kind,
  response,
  outDir = "flatkey-output",
  output,
  format,
  downloadRemote = false,
  fetch: fetchImpl = fetch,
}) {
  output = expandHomePath(output);
  const items = kind === "image" ? extractImageItems(response) : extractItems(response);
  const artifacts = [];
  const extension = artifactExtension({ kind, format });
  await mkdir(output ? dirname(output) : outDir, { recursive: true });
  const startIndex = output ? 0 : await nextArtifactIndex({ kind, outDir, format });

  for (const [index, item] of items.entries()) {
    const artifact = await persistItem({
      kind,
      item,
      outDir,
      output,
      index: index + startIndex,
      extension: kind === "image" ? item.extension ?? extension : extension,
      downloadRemote,
      fetchImpl,
    });
    if (artifact) artifacts.push(artifact);
  }

  return artifacts;
}

export async function nextArtifactPath({ kind, outDir = "flatkey-output", format }) {
  const extension = artifactExtension({ kind, format });
  const index = await nextArtifactIndex({ kind, outDir, format });
  const number = String(index + 1).padStart(2, "0");
  return join(outDir, `${kind}-${number}.${extension}`);
}

function artifactExtension({ kind, format }) {
  return FORMAT_EXTENSIONS[String(format ?? "").toLowerCase()]
    ?? DEFAULT_EXTENSIONS[kind]
    ?? "bin";
}

function expandHomePath(path) {
  if (typeof path !== "string") return path;
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

async function persistItem({ kind, item, outDir, output, index, extension, downloadRemote, fetchImpl }) {
  const location = { kind, outDir, output, index, extension };
  const dataUrl = getString(item, ["url", "video_url", "data_url", "dataUrl", "temp_url"]);
  if (dataUrl?.startsWith("data:")) {
    const parsed = parseDataUrl(dataUrl);
    return writeLocalArtifact({ ...location, extension: parsed.extension }, parsed.buffer);
  }
  if (dataUrl?.startsWith("http://") || dataUrl?.startsWith("https://")) {
    if (output || downloadRemote) {
      const bytes = await downloadArtifact({ url: dataUrl, fetchImpl });
      return writeLocalArtifact(location, bytes);
    }
    return { url: dataUrl };
  }

  const base64 = getString(item, ["b64_json", "base64", "data"]);
  if (base64) {
    return writeLocalArtifact(location, Buffer.from(base64, "base64"));
  }

  return undefined;
}

async function writeLocalArtifact(location, bytes) {
  if (location.output) {
    const path = artifactPath(location);
    await writeFile(path, bytes);
    return { path };
  }

  for (let index = location.index; ; index++) {
    const path = artifactPath({ ...location, index });
    let file;
    try {
      file = await open(path, "wx");
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
    let complete = false;
    try {
      await file.writeFile(bytes);
      complete = true;
    } finally {
      await file.close();
      if (!complete) await unlink(path);
    }
    return { path };
  }
}

async function downloadArtifact({ url, fetchImpl }) {
  const response = await fetchImpl(url, { headers: CLI_REQUEST_HEADERS });
  if (!response.ok) {
    await response.body?.cancel?.();
    throw responseError(response, undefined, {
      message: `Failed to download artifact (HTTP ${response.status}).`,
      code: "artifact_download_failed",
    });
  }
  return Buffer.from(await response.arrayBuffer());
}

const BLOCKED_IMAGE_REASONS = new Set([
  "SAFETY", "IMAGE_SAFETY", "BLOCKLIST", "BLOCKED", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT",
  "RECITATION", "IMAGE_RECITATION", "SPII", "CONTENT_FILTER", "ESCALATION",
]);

function imageBlockReason(candidate) {
  const reason = candidate?.finishReason ?? candidate?.finish_reason;
  if (BLOCKED_IMAGE_REASONS.has(reason)) return reason;
  const ratings = candidate?.safetyRatings ?? candidate?.safety_ratings;
  const blocked = Array.isArray(ratings) && ratings.find((rating) => rating?.blocked === true);
  return blocked ? blocked.category ?? "SAFETY" : undefined;
}

function extractImageItems(response) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const parts = candidates.filter((candidate) => !imageBlockReason(candidate))
    .flatMap((candidate) => candidate?.content?.parts ?? []);
  for (const group of [response?.data, response?.artifacts, response?.content, parts, [response, response?.metadata]]) {
    if (!Array.isArray(group)) continue;
    const images = group.map(imageArtifact).filter(Boolean);
    if (images.length) return images;
  }

  const feedback = response?.promptFeedback ?? response?.prompt_feedback;
  const reason = feedback?.blockReason ?? feedback?.block_reason;
  const blocked = (reason && reason !== "BLOCK_REASON_UNSPECIFIED" ? reason : undefined)
    ?? imageBlockReason(feedback) ?? candidates.map(imageBlockReason).find(Boolean);
  if (blocked) {
    throw new FlatkeyError(`Image generation was blocked by the provider (${blocked}).`, {
      ...getResponseMetadata(response),
      code: "image_generation_blocked",
      finishReason: blocked,
    });
  }
  const finish = candidates.map((c) => c?.finishReason ?? c?.finish_reason).find(Boolean);
  const failedItem = Array.isArray(response?.data) && response.data.find((item) => item?.error?.message);
  const detail = response?.error?.message ?? failedItem?.error?.message ?? finish;
  throw new FlatkeyError(`Image generation returned no image${detail ? ` (${detail})` : ""}.`, {
    ...getResponseMetadata(response),
    code: "image_no_output",
    finishReason: finish,
  });
}

function imageArtifact(item) {
  if (!item || item.thought || item.error) return undefined;
  const media = item.fileData ?? item.file_data ?? item.inlineData ?? item.inline_data ?? item;
  const mime = String(media.mimeType ?? media.mime_type ?? "").toLowerCase();
  if (mime && !mime.startsWith("image/")) return undefined;
  const url = getString(media, ["url", "temp_url", "fileUri", "file_uri", "data_url", "dataUrl", "image_url"])
    ?? item.temp_url;
  if (typeof url === "string" && ((/^https?:\/\//.test(url) && URL.canParse(url))
    || /^data:image\/[^;,]+;base64,[A-Za-z0-9+/]/.test(url))) return { url };
  const encodedImage = getString(media, ["b64_json", "base64"]);
  const data = (encodedImage ?? getString(media, ["data"]))?.trim();
  if (!data) return undefined;
  const head = Buffer.from(data.slice(0, 24), "base64");
  if (!head.length) return undefined;
  let format = MIME_EXTENSIONS[mime];
  if (!format) {
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) format = "jpg";
    else if (data.startsWith("iVBORw0KGgo")) format = "png";
    else if (head.toString("ascii", 0, 3) === "GIF") format = "gif";
    else if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") format = "webp";
  }
  if (!format && !mime && !encodedImage) return undefined;
  return { b64_json: data, extension: format };
}

function extractItems(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.artifacts)) return response.artifacts;
  if (Array.isArray(response?.content)) return response.content;
  if (Array.isArray(response?.candidates)) {
    return response.candidates.flatMap((candidate) => candidate.content?.parts ?? []);
  }
  if (typeof response?.temp_url === "string") return [{ url: response.temp_url }];
  if (typeof response?.metadata?.temp_url === "string") return [{ url: response.metadata.temp_url }];
  if (typeof response?.metadata?.url === "string") return [{ url: response.metadata.url }];
  if (typeof response?.url === "string") return [response];
  if (typeof response?.video_url?.url === "string") return [{ url: response.video_url.url }];
  if (typeof response?.video?.url === "string") return [{ url: response.video.url }];
  if (typeof response?.video?.temp_url === "string") return [{ url: response.video.temp_url }];
  return [];
}

function getString(item, keys) {
  for (const key of keys) {
    if (typeof item?.[key] === "string") return item[key];
    if (typeof item?.[key]?.url === "string") return item[key].url;
    if (typeof item?.inlineData?.[key] === "string") return item.inlineData[key];
    if (typeof item?.inline_data?.[key] === "string") return item.inline_data[key];
  }
  return undefined;
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  if (!match) throw new Error("Unsupported data URL artifact.");
  return {
    extension: MIME_EXTENSIONS[match[1]] ?? "bin",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function artifactPath({ kind, outDir, output, index, extension }) {
  if (output) {
    if (index === 0) return output;
    const existingExtension = extname(output);
    const base = existingExtension ? output.slice(0, -existingExtension.length) : output;
    const suffix = String(index + 1).padStart(2, "0");
    return `${base}-${suffix}${existingExtension || `.${extension}`}`;
  }
  const number = String(index + 1).padStart(2, "0");
  return join(outDir, `${kind}-${number}.${extension}`);
}

async function nextArtifactIndex({ kind, outDir, format }) {
  const extension = artifactExtension({ kind, format });
  const suffix = kind === "image" ? "[^.]+" : escapeRegExp(extension);
  const pattern = new RegExp(`^${escapeRegExp(kind)}-(\\d+)\\.${suffix}$`);
  let max = 0;
  try {
    for (const entry of await readdir(outDir)) {
      const match = pattern.exec(entry);
      if (!match) continue;
      max = Math.max(max, Number.parseInt(match[1], 10));
    }
  } catch {
    return 0;
  }
  return max;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
