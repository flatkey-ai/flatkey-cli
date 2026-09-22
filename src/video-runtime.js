import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const VIDEO_RUNTIME_VERSION = "0.1.0";

export function runtimePlatform(platform = process.platform, arch = process.arch) {
  const supported = {
    darwin: { arm64: "darwin-arm64", x64: "darwin-x64" },
    linux: { arm64: "linux-arm64", x64: "linux-x64" },
    win32: { arm64: "win32-arm64", x64: "win32-x64" },
  };
  const target = supported[platform]?.[arch];
  if (!target) throw new Error(`Unsupported Flatkey video runtime platform: ${platform}-${arch}`);
  return target;
}

export async function runtimeDirectory({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  const target = runtimePlatform(platform, arch);
  const base = env.FLATKEY_RUNTIME_HOME
    ?? (platform === "win32"
      ? join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "flatkey")
      : platform === "darwin"
        ? join(homedir(), "Library", "Caches", "flatkey")
        : join(env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "flatkey"));
  return join(base, "runtime", VIDEO_RUNTIME_VERSION, target);
}

export async function ensureVideoRuntime(options = {}) {
  const directory = await runtimeDirectory(options);
  const helperName = options.platform === "win32" || (options.platform ?? process.platform) === "win32"
    ? "flatkey-depth.exe"
    : "flatkey-depth";
  const helperPath = join(directory, helperName);
  try {
    await stat(helperPath);
    return { directory, helperPath, downloaded: false };
  } catch {
    // Continue to download below.
  }

  const baseUrl = options.baseUrl
    ?? options.env?.FLATKEY_VIDEO_RUNTIME_BASE_URL
    ?? process.env.FLATKEY_VIDEO_RUNTIME_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      `Flatkey video runtime is missing at ${helperPath}. Set FLATKEY_VIDEO_RUNTIME_BASE_URL to enable automatic download.`,
    );
  }
  const target = runtimePlatform(options.platform, options.arch);
  const fetchImpl = options.fetch ?? fetch;
  const manifestUrl = `${baseUrl.replace(/\/$/, "")}/${VIDEO_RUNTIME_VERSION}/${target}/manifest.json`;
  const manifestResponse = await fetchImpl(manifestUrl);
  if (!manifestResponse.ok) throw new Error(`Failed to download Flatkey video runtime manifest: HTTP ${manifestResponse.status}`);
  const manifest = await manifestResponse.json();
  const archiveUrl = manifest.archive_url ?? manifest.url;
  if (Array.isArray(manifest.files)) {
    await mkdir(directory, { recursive: true });
    for (const file of manifest.files) {
      await downloadRuntimeFile(file, directory, fetchImpl);
    }
    await stat(helperPath);
    return { directory, helperPath, downloaded: true };
  }

  const sha256 = manifest.sha256;
  if (!archiveUrl || !sha256) throw new Error("Flatkey video runtime manifest is missing files or archive_url/sha256.");

  const archivePath = join(tmpdir(), `flatkey-video-runtime-${Date.now()}.archive`);
  try {
    const response = await fetchImpl(archiveUrl);
    if (!response.ok) throw new Error(`Failed to download Flatkey video runtime: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== sha256.toLowerCase()) throw new Error("Flatkey video runtime checksum verification failed.");
    await mkdir(directory, { recursive: true });
    await writeFile(archivePath, bytes);
    await extractArchive(archivePath, directory, options);
    await stat(helperPath);
    return { directory, helperPath, downloaded: true };
  } finally {
    await rm(archivePath, { force: true });
  }
}

async function downloadRuntimeFile(file, directory, fetchImpl) {
  if (!file?.path || !file?.url || !file?.sha256) {
    throw new Error("Flatkey video runtime manifest contains an invalid file entry.");
  }
  if (file.path.includes("..") || file.path.startsWith("/") || /^[a-z]:/i.test(file.path)) {
    throw new Error(`Flatkey video runtime manifest contains an unsafe path: ${file.path}`);
  }
  const response = await fetchImpl(file.url);
  if (!response.ok) throw new Error(`Failed to download Flatkey video runtime file ${file.path}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== file.sha256.toLowerCase()) {
    throw new Error(`Flatkey video runtime checksum verification failed for ${file.path}.`);
  }
  const destination = join(directory, file.path);
  await mkdir(join(destination, ".."), { recursive: true });
  await writeFile(destination, bytes);
  if (file.executable || file.mode === "755") {
    await chmod(destination, 0o755);
  }
}

async function extractArchive(archivePath, directory, options) {
  if (options.extractArchive) {
    await options.extractArchive(archivePath, directory);
    return;
  }
  throw new Error("Flatkey video runtime archive extraction is not configured for this build.");
}

export async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
