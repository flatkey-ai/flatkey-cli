import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { getConfigPath, resolveApiKey, writeConfig } from "../src/config.js";

test("resolves api key from explicit option first", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));
  await writeConfig({ apiKey: "saved-key", configDir });

  const key = await resolveApiKey({
    apiKey: "option-key",
    env: { FLATKEY_API_KEY: "env-key" },
    configDir,
  });

  assert.equal(key, "option-key");
});

test("resolves api key from FLATKEY_API_KEY before saved config", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));
  await writeConfig({ apiKey: "saved-key", configDir });

  const key = await resolveApiKey({
    env: { FLATKEY_API_KEY: "env-key" },
    configDir,
  });

  assert.equal(key, "env-key");
});

test("resolves api key from saved config", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));
  await writeConfig({ apiKey: "saved-key", configDir });

  const key = await resolveApiKey({ env: {}, configDir });

  assert.equal(key, "saved-key");
});

test("throws actionable error when api key is missing", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));

  await assert.rejects(
    () => resolveApiKey({ env: {}, configDir }),
    /Missing Flatkey API key.*https:\/\/console\.flatkey\.ai\/keys.*flatkey onboard.*FLATKEY_API_KEY/s,
  );
});

test("rejects empty api key when writing config", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));

  await assert.rejects(
    () => writeConfig({ apiKey: "", configDir }),
    /Missing --api-key value.*https:\/\/console\.flatkey\.ai\/keys/s,
  );
  await assert.rejects(
    () => writeConfig({ apiKey: true, configDir }),
    /Missing --api-key value.*https:\/\/console\.flatkey\.ai\/keys/s,
  );
});

test("writes config json with api key", async () => {
  const configDir = await mkdtemp(join(tmpdir(), "flatkey-config-"));

  const configPath = await writeConfig({ apiKey: "written-key", configDir });
  const saved = JSON.parse(await readFile(configPath, "utf8"));
  const fileStat = await stat(configPath);

  assert.equal(configPath, getConfigPath(configDir));
  assert.equal(saved.apiKey, "written-key");
  assert.ok((fileStat.mode & 0o777) === 0o600 || process.platform === "win32");
});
