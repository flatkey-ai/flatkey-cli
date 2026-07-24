import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function getDefaultConfigDir() {
  return join(homedir(), ".config", "flatkey");
}

export function getConfigPath(configDir = getDefaultConfigDir()) {
  return join(configDir, "config.json");
}

export async function resolveApiKey({
  apiKey,
  env = process.env,
  configDir = getDefaultConfigDir(),
} = {}) {
  if (apiKey) return apiKey;
  if (env.FLATKEY_API_KEY) return env.FLATKEY_API_KEY;

  const saved = await readSavedConfig(configDir);
  if (saved?.apiKey) return saved.apiKey;

  throw new Error(
    "Missing Flatkey API key. Create one at https://console.flatkey.ai/keys, then run `flatkey onboard --api-key <key>` or set FLATKEY_API_KEY.",
  );
}

export async function writeConfig({ apiKey, configDir = getDefaultConfigDir() }) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("Missing --api-key value. Create a key at https://console.flatkey.ai/keys, then run `flatkey onboard --api-key <key>`.");
  }

  await mkdir(configDir, { recursive: true });
  const configPath = getConfigPath(configDir);
  await writeFile(configPath, `${JSON.stringify({ apiKey }, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await chmod(configPath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
  return configPath;
}

async function readSavedConfig(configDir) {
  try {
    return JSON.parse(await readFile(getConfigPath(configDir), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}
