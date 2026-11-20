import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateVideo, getCredits } from "../src/api.js";
import { parseArgv, runCommand } from "../src/cli.js";

test("boolean switches leave -o and its argument for the output option", () => {
  for (const flag of ["--json", "--verbose", "--dry-run"]) {
    const { options } = parseArgv(["image", "generate", flag, "-o", "cover.png"]);
    assert.equal(options.output, "cover.png");
    assert.equal(options[flag.slice(2).replace("-", "_")], true);
  }
  assert.equal(parseArgv(["image", "generate", "--verbose=false", "-o", "x"]).options.verbose, false);
  assert.equal(parseArgv(["video", "generate", "--duration", "-1"]).options.duration, "-1");
});

test("rate-limited generation honors Retry-After and retries an explicit rejection", async () => {
  const delays = [];
  const requests = [];
  const options = {
    apiKey: "fixture", model: "seedance2", prompt: "fixture",
    sleep: async (ms) => { delays.push(ms); },
    fetch: async (url, init) => {
      requests.push(init.body);
      return requests.length === 1
        ? Response.json({ error: { code: "rate_limited" } }, { status: 429, headers: { "retry-after": "2" } })
        : Response.json({ id: "task-ok" });
    },
  };
  assert.equal((await generateVideo(options)).id, "task-ok");
  assert.deepEqual(delays, [2000]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
});

test("transient read errors back off, but an ambiguous generation submission is not replayed", async () => {
  let reads = 0;
  const pauses = [];
  const result = await getCredits({
    apiKey: "fixture",
    sleep: async (ms) => { pauses.push(ms); },
    fetch: async () => {
      if (++reads === 1) throw new TypeError("fetch failed");
      if (reads === 2) return Response.json({}, { status: 503 });
      return Response.json({ remaining: 42 });
    },
  });
  assert.equal(result.remaining, 42);
  assert.equal(pauses.length, 2);
  assert.ok(pauses[1] > pauses[0]);
  for (const failure of ["network", "bad gateway"]) {
    let submissions = 0;
    await assert.rejects(() => generateVideo({
      apiKey: "fixture", model: "seedance2", prompt: "fixture",
      sleep: async () => {},
      fetch: async () => {
        submissions++;
        if (failure === "network") throw new TypeError("fetch failed");
        return Response.json({ error: { message: failure } }, { status: 502 });
      },
    }));
    assert.equal(submissions, 1);
  }
});

test("a long Retry-After is surfaced to the caller without retrying early", async () => {
  let requests = 0;
  await assert.rejects(() => getCredits({
    apiKey: "fixture",
    fetch: async () => {
      requests++;
      return Response.json({ error: { code: "rate_limit", message: "slow down" } }, {
        status: 429, headers: { "retry-after": "120", "x-request-id": "req-retry" },
      });
    },
  }), { status: 429, code: "rate_limit", retryAfterMs: 120000, requestId: "req-retry" });
  assert.equal(requests, 1);
});

test("omitting the model selects a routable model available to the account before submitting", async (t) => {
  const paths = [];
  const outDir = await mkdtemp(join(tmpdir(), "flatkey-default-image-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const result = await runCommand(parseArgv([
    "image", "generate", "--base-url", "https://router.test", "--console-url", "https://console.test",
    "--api-key", "fixture", "--prompt", "fixture", "--out", outDir, "--json",
  ]), {
    fetch: async (url) => {
      paths.push(url);
      if (url === "https://console.test/v1/available_models") {
        return Response.json({ data: [{ id: "unknown-image", type: "image" }, { id: "gpt-image-2", type: "image" }] });
      }
      assert.equal(url, "https://router.test/v1/images/generations");
      return Response.json({ data: [{ url: "https://cdn.test/result.png" }] });
    },
  });
  assert.equal(paths.length, 2);
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.artifacts[0].url, "https://cdn.test/result.png");
});

test("an offline preview selects an example compatible with the requested format", async () => {
  const preview = await runCommand(parseArgv([
    "image", "generate", "--prompt", "fixture", "--output-format", "gif", "--dry-run", "--api-key", "private-fixture",
  ]), { fetch: async () => assert.fail("an offline preview issued a request") });
  assert.equal(preview.previewModel, "gpt-image-2.6");
  assert.equal(preview.request.body.output_format, "gif");
  assert.ok(!JSON.stringify(preview).includes("private-fixture"));
});

test("an empty eligible catalog fails before media upload or generation", async () => {
  const paths = [];
  await assert.rejects(() => runCommand(parseArgv([
    "video", "generate", "--api-key", "fixture", "--prompt", "fixture", "--file", "missing.png", "--json",
  ]), {
    fetch: async (url) => {
      paths.push(new URL(url).pathname);
      return Response.json({ data: [{ id: "gpt-image-2", type: "image" }] });
    },
  }), { code: "no_available_model" });
  assert.deepEqual(paths, ["/v1/available_models"]);
});

test("video copy selects a model that can represent the depth video before starting local processing", async () => {
  const paths = [];
  await assert.rejects(() => runCommand(parseArgv([
    "video", "copy", "--api-key", "fixture", "--source", "clip.mp4", "--json",
  ]), {
    prepareVideoCopy: async () => assert.fail("unsupported model started depth extraction"),
    fetch: async (url) => {
      paths.push(new URL(url).pathname);
      return Response.json({ data: [{ id: "grok-imagine-video", type: "video" }] });
    },
  }), { code: "no_available_model" });
  assert.deepEqual(paths, ["/v1/available_models"]);
});

test("models --pricing joins public PLG rates to the authenticated catalog by exact ID", async () => {
  const paths = [];
  const result = await runCommand(parseArgv([
    "models", "--type", "image", "--pricing", "--api-key", "fixture", "--console-url", "https://console.test",
  ]), {
    fetch: async (url, init) => {
      paths.push(url);
      if (url.endsWith("/v1/available_models")) {
        assert.equal(init.headers.Authorization, "Bearer fixture");
        return Response.json({ data: [{ id: "seedream-5-0-pro", type: "image" }, { id: "unknown-image", type: "image" }] });
      }
      assert.equal(init.headers.Authorization, undefined);
      return Response.json({ display_pricing: {
        "seedream-5-0-pro": { billing_kind: "request", prices: { request: { configured: "0.05", plg: "0.04" } } },
        "different-model": { billing_kind: "request", prices: { request: { plg: "1" } } },
      } });
    },
  });
  assert.deepEqual(paths, ["https://console.test/v1/available_models", "https://console.test/api/website/pricing?group=plg"]);
  assert.equal(result.pricingGroup, "plg");
  assert.equal(result.models[0].pricing.prices.request.plg, "0.04");
  assert.equal(result.models[1].pricing, null);
});
