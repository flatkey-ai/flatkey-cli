import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

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
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
};

export async function persistArtifacts({
  kind,
  response,
  outDir = "flatkey-output",
  output,
  fetch: fetchImpl = fetch,
}) {
  const items = extractItems(response);
  const artifacts = [];
  await mkdir(output ? dirname(output) : outDir, { recursive: true });

  for (const [index, item] of items.entries()) {
    const artifact = await persistItem({ kind, item, outDir, output, index, fetchImpl });
    if (artifact) artifacts.push(artifact);
  }

  return artifacts;
}

async function persistItem({ kind, item, outDir, output, index, fetchImpl }) {
  const dataUrl = getString(item, ["url", "data_url", "dataUrl"]);
  if (dataUrl?.startsWith("data:")) {
    const parsed = parseDataUrl(dataUrl);
    const path = artifactPath({ kind, outDir, output, index, extension: parsed.extension });
    await writeFile(path, parsed.buffer);
    return { path };
  }
  if (dataUrl?.startsWith("http://") || dataUrl?.startsWith("https://")) {
    if (output) {
      const path = artifactPath({
        kind,
        outDir,
        output,
        index,
        extension: DEFAULT_EXTENSIONS[kind] ?? "bin",
      });
      await downloadArtifact({ url: dataUrl, path, fetchImpl });
      return { path };
    }
    return { url: dataUrl };
  }

  const base64 = getString(item, ["b64_json", "base64", "data"]);
  if (base64) {
    const path = artifactPath({ kind, outDir, output, index, extension: DEFAULT_EXTENSIONS[kind] });
    await writeFile(path, Buffer.from(base64, "base64"));
    return { path };
  }

  return undefined;
}

async function downloadArtifact({ url, path, fetchImpl }) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact ${url}: HTTP ${response.status}`);
  }
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

function extractItems(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.artifacts)) return response.artifacts;
  if (Array.isArray(response?.candidates)) {
    return response.candidates.flatMap((candidate) => candidate.content?.parts ?? []);
  }
  return [];
}

function getString(item, keys) {
  for (const key of keys) {
    if (typeof item?.[key] === "string") return item[key];
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
