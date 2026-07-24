import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const ROUTER_ORIGIN_KEY = "routerOrigin";
export const CONSOLE_ORIGIN_KEY = "consoleOrigin";

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

  const saved = await readSavedConfig(configDir);
  if (saved?.apiKey) return saved.apiKey;
  if (env.FLATKEY_API_KEY) return env.FLATKEY_API_KEY;

  throw new Error(
    "Missing or invalid Flatkey API key. Run `flatkey login`, or create a key at https://console.flatkey.ai/keys and run `flatkey onboard --api-key <key>`.",
  );
}

export async function resolveOrigins({
  baseUrl,
  consoleUrl,
  env = process.env,
  configDir = getDefaultConfigDir(),
} = {}) {
  const saved = await readSavedConfig(configDir);
  return {
    routerOrigin: firstNonEmpty(
      baseUrl,
      saved?.[ROUTER_ORIGIN_KEY],
      saved?.ROUTER_ORIGIN,
      env.ROUTER_ORIGIN,
    ),
    consoleOrigin: firstNonEmpty(
      consoleUrl,
      baseUrl,
      saved?.[CONSOLE_ORIGIN_KEY],
      saved?.CONSOLE_ORIGIN,
      env.CONSOLE_ORIGIN,
    ),
  };
}

export async function writeConfig({ apiKey, configDir = getDefaultConfigDir() }) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("Missing --api-key value. Create a key at https://console.flatkey.ai/keys, then run `flatkey onboard --api-key <key>`.");
  }

  await mkdir(configDir, { recursive: true });
  const configPath = getConfigPath(configDir);
  const saved = await readSavedConfig(configDir) ?? {};
  await writeFile(configPath, `${JSON.stringify({ ...saved, apiKey }, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await chmod(configPath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
  return configPath;
}

export async function writeAuthConfig({
  apiKey,
  auth,
  configDir = getDefaultConfigDir(),
}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error("Missing API key from Flatkey login response.");
  }
  const saved = await readSavedConfig(configDir) ?? {};
  const next = {
    ...saved,
    apiKey,
    auth: {
      ...(saved.auth ?? {}),
      ...auth,
      type: "device",
    },
  };
  await mkdir(configDir, { recursive: true });
  const configPath = getConfigPath(configDir);
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    await chmod(configPath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
  return configPath;
}

export async function ensureDeviceId({ configDir = getDefaultConfigDir() } = {}) {
  const saved = await readSavedConfig(configDir);
  if (typeof saved?.auth?.deviceId === "string" && saved.auth.deviceId) {
    return saved.auth.deviceId;
  }
  return randomUUID();
}

export async function clearSavedApiKey({ configDir = getDefaultConfigDir() } = {}) {
  const saved = await readSavedConfig(configDir);
  if (!saved) return getConfigPath(configDir);
  const next = { ...saved };
  delete next.apiKey;
  await mkdir(configDir, { recursive: true });
  const configPath = getConfigPath(configDir);
  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return configPath;
}

export async function readConfig(configDir = getDefaultConfigDir()) {
  return readSavedConfig(configDir);
}

async function readSavedConfig(configDir) {
  try {
    return JSON.parse(await readFile(getConfigPath(configDir), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "");
}
