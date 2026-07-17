import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { test } from "node:test";

test("package exposes @flatkey-ai/cli flatkey binary", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const binStat = await stat("bin/flatkey.js");

  assert.equal(pkg.name, "@flatkey-ai/cli");
  assert.equal(pkg.bin.flatkey, "bin/flatkey.js");
  assert.ok((binStat.mode & 0o111) !== 0);
});

test("release channel docs exist", async () => {
  await access("README.md", constants.R_OK);
  await access("release/homebrew/flatkey.rb", constants.R_OK);
  await access("release/deb/README.md", constants.R_OK);
  await access("release/msi/README.md", constants.R_OK);
});

test("github workflow publishes npm with secret token", async () => {
  const workflow = await readFile(".github/workflows/npm-publish.yml", "utf8");

  assert.match(workflow, /on:\n\s+workflow_dispatch:/);
  assert.match(workflow, /tags:\n\s+- "v\*"/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.match(workflow, /npm publish --access public/);
});
