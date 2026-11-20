import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { planVideoRequest } from "../src/api.js";
import { main, parseArgv, runCommand } from "../src/cli.js";

const router = "https://router.test";
const id = "task_fixture";
const statusUrl = `${router}/v1/videos/${id}`;

async function fixture(t, responder, env = {}) {
  const dir = await mkdtemp(join(tmpdir(), "flatkey-video-task-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const deps = {
    configDir: dir,
    env,
    sleep: async () => {},
    fetch: async (url, init) => {
      calls.push({ url, method: init.method ?? "GET", authorization: new Headers(init.headers).get("authorization") });
      return responder(url, init);
    },
  };
  return {
    dir, calls, deps,
    run: (...args) => runCommand(parseArgv(["video", ...args, "--base-url", router, "--api-key", "fixture", "--json"]), deps),
  };
}

test("video status accepts both task ID forms and returns the existing task", async (t) => {
  const f = await fixture(t, () => Response.json({ id, status: "in_progress", progress: 47 }));
  for (const input of [[id], ["--task-id", id]]) {
    const result = await f.run("status", ...input);
    assert.equal(result.taskId, id);
    assert.equal(result.status, "in_progress");
    assert.equal(result.progress, 47);
  }
  assert.deepEqual(f.calls, [0, 1].map(() => ({ url: statusUrl, method: "GET", authorization: "Bearer fixture" })));
  await assert.rejects(f.run("status"), /task.id/i);
  assert.equal(f.calls.length, 2);
});

test("video download uses authenticated router content for an existing completed task", async (t) => {
  const f = await fixture(t, (url) => {
    if (url === statusUrl) return Response.json({ status: "completed", metadata: { url: "https://storage.test/signed" } });
    assert.equal(url, `${statusUrl}/content`);
    return new Response("video-bytes");
  });
  const path = join(f.dir, "saved.mp4");
  const result = await f.run("download", id, "-o", path);
  assert.equal(result.taskId, id);
  assert.deepEqual(result.artifacts, [{ path }]);
  assert.equal(await readFile(path, "utf8"), "video-bytes");
  assert.deepEqual(f.calls.map(({ method, authorization }) => [method, authorization]),
    [["GET", "Bearer fixture"], ["GET", "Bearer fixture"]]);
  const concurrent = await Promise.all([f.run("download", id, "--out", f.dir), f.run("download", id, "--out", f.dir)]);
  const paths = concurrent.map((download) => download.artifacts[0].path).sort();
  assert.deepEqual(paths, [join(f.dir, "video-01.mp4"), join(f.dir, "video-02.mp4")]);
  for (const path of paths) assert.equal(await readFile(path, "utf8"), "video-bytes");
});

test("downloading unfinished or failed tasks reports their state without writing a file", async (t) => {
  for (const status of ["queued", "failed", "cancelled"]) {
    const f = await fixture(t, () => Response.json({ status, metadata: { url: "https://storage.test/placeholder" } }));
    await assert.rejects(f.run("download", "--task-id", id, "--out", f.dir), (error) => {
      assert.equal(error.taskId, id);
      assert.equal(error.taskStatus, status);
      assert.match(error.message, new RegExp(status));
      return true;
    });
    assert.equal(f.calls.length, 1);
    assert.deepEqual(await readdir(f.dir), []);
  }
});

test("a polling error retains its HTTP details, recovery command and original task ID", async (t) => {
  const f = await fixture(t, (url) => url === statusUrl
    ? Response.json({ error: { message: "temporary upstream error", code: "bad_task" } }, {
      status: 400, headers: { "x-request-id": "req_fixture", "retry-after": "45" },
    })
    : Response.json({ task_id: id, status: "queued" }));
  await assert.rejects(f.run("generate", "--model", "seedance2", "--prompt", "test"), (error) => {
    assert.equal(error.taskId, id);
    assert.equal(error.status, 400);
    assert.equal(error.code, "bad_task");
    assert.equal(error.requestId, "req_fixture");
    assert.equal(error.retryAfterMs, 45_000);
    assert.match(error.message, /temporary upstream error/);
    assert.match(error.message, /flatkey video status.*task_fixture/);
    return true;
  });
  assert.deepEqual(f.calls.map(({ method }) => method), ["POST", "GET"]);
});

test("Seedance output-audio copyright failures retain the reason and suggest a new silent video", async (t) => {
  const reason = "The output audio may be related to copyright restrictions.";
  const failed = { id, model: "seedance-2-5-pro", status: "failed", error: { code: "OutputAudioCopyright", message: reason } };
  const f = await fixture(t, (url, init) => {
    if (init.method === "POST") {
      assert.equal(JSON.parse(init.body).generate_audio, true);
      return Response.json({ id, status: "queued" });
    }
    assert.equal(url, statusUrl);
    return Response.json({ data: failed }, { headers: { "x-oneapi-request-id": "req_audio_review" } });
  });
  await assert.rejects(f.run("generate", "--model", "seedance-2-5-pro", "--prompt", "test"), (error) => {
    assert.equal(error.taskId, id);
    assert.equal(error.code, failed.error.code);
    assert.equal(error.requestId, "req_audio_review");
    assert.equal(error.status, 200);
    assert.ok(error.message.includes(reason));
    assert.match(error.message, /new task.*--generate-audio false/i);
    return true;
  });
  const status = await f.run("status", id);
  assert.equal(status.taskId, id);
  assert.equal(status.requestId, "req_audio_review");
  assert.equal(status.error.message, reason);
  assert.match(status.hint, /--generate-audio false/);
  assert.deepEqual(f.calls.map(({ method }) => method), ["POST", "GET", "GET"]);
});

test("silent-video guidance is specific to Seedance generated audio", async (t) => {
  for (const [model, reason, flags] of [
    ["seedance2", "The output image may be related to copyright restrictions.", []],
    ["seedance2", "The input audio may be related to copyright restrictions.", []],
    ["MiniMax-H3", "The output audio may be related to copyright restrictions.", []],
    ["seedance2", "The output audio may be related to copyright restrictions.", ["--generate-audio", "false"]],
  ]) {
    const f = await fixture(t, () => Response.json({ id, status: "failed", error: { message: reason } }));
    await assert.rejects(f.run("generate", "--model", model, "--prompt", "test", "--no-wait", ...flags), (error) => {
      assert.equal(error.taskId, id);
      assert.ok(error.message.includes(reason));
      assert.doesNotMatch(error.message, /--generate-audio false/);
      return true;
    });
    assert.deepEqual(f.calls.map(({ method }) => method), ["POST"]);
  }
});

test("video copy keeps one submission after an uncertain POST or a polling failure", async (t) => {
  for (const accepted of [false, true]) {
    const f = await fixture(t, (url) => {
      if (url.endsWith("/v1/temp-media/videos")) return Response.json({ data: { signed_url: "https://storage.test/depth.mp4" } });
      if (url === `${router}/v1/videos`) {
        if (accepted) return Response.json({ id, status: "queued" });
        throw new TypeError("failed to fetch");
      }
      assert.equal(url, statusUrl);
      return Response.json({ code: "fail_to_fetch_task", message: "failed to fetch task" }, { status: 400 });
    });
    const depthPath = join(f.dir, "depth.mp4");
    await writeFile(depthPath, "video");
    f.deps.prepareVideoCopy = async () => ({ depthPath, duration: 8, referencePaths: [] });
    await assert.rejects(f.run("copy", "--model", "seedance2", "--source", depthPath), (error) => {
      assert.equal(error.code, accepted ? "fail_to_fetch_task" : "network_error");
      assert.equal(error.taskId, accepted ? id : undefined);
      return true;
    });
    assert.equal(f.calls.filter(({ url }) => url === `${router}/v1/videos`).length, 1);
  }
});

test("video download preserves a router content error and the existing task ID", async (t) => {
  const f = await fixture(t, (url) => url === statusUrl
    ? Response.json({ status: "completed" })
    : Response.json({ error: { message: "content unavailable", code: "not_found" } }, { status: 404 }));
  await assert.rejects(f.run("download", id, "--out", f.dir), (error) => {
    assert.equal(error.taskId, id);
    assert.equal(error.taskStatus, "completed");
    assert.equal(error.status, 404);
    assert.equal(error.code, "not_found");
    assert.match(error.message, /flatkey video download/);
    return true;
  });
  assert.deepEqual(await readdir(f.dir), []);
});

test("a wait timeout preserves the existing task and offers status lookup", async (t) => {
  const f = await fixture(t, () => Response.json({ id, status: "processing" }), { FLATKEY_VIDEO_WAIT_TIMEOUT_MS: "5" });
  f.deps.sleep = () => new Promise((resolve) => setTimeout(resolve, 15));
  await assert.rejects(f.run("generate", "--model", "seedance2", "--prompt", "test"), (error) => {
    assert.equal(error.taskId, id);
    assert.match(error.message, /flatkey video status.*task_fixture/);
    return true;
  });
  assert.equal(f.calls.filter(({ method }) => method === "POST").length, 1);
});

test("video polling bounds a hanging GET and Retry-After delays by the wait deadline", async (t) => {
  for (const retryAfter of [undefined, "1", "60"]) {
    let pollSignal;
    const f = await fixture(t, (url, init) => {
      if (init.method === "POST") return Response.json({ id, status: "queued" });
      assert.equal(url, statusUrl);
      pollSignal = init.signal;
      assert.ok(pollSignal instanceof AbortSignal);
      if (retryAfter) return Response.json({}, { status: 429, headers: { "retry-after": retryAfter } });
      return new Promise((resolve, reject) => {
        pollSignal.addEventListener("abort", () => reject(pollSignal.reason), { once: true });
      });
    }, { FLATKEY_VIDEO_WAIT_TIMEOUT_MS: "40" });
    delete f.deps.sleep;
    await assert.rejects(f.run("generate", "--model", "seedance2", "--prompt", "test"), (error) => {
      assert.equal(error.taskId, id);
      assert.equal(error.code, "video_wait_timeout");
      assert.equal(error.taskStatus, "queued");
      if (retryAfter === "60") assert.equal(error.retryAfterMs, 60_000);
      return true;
    });
    if (retryAfter !== "60") assert.equal(pollSignal.aborted, true);
    assert.deepEqual(f.calls.map(({ method }) => method), ["POST", "GET"]);
  }
});

test("--no-wait returns the accepted video generate or copy task without polling or saving", async (t) => {
  for (const action of ["generate", "copy"]) {
    const f = await fixture(t, (url, init) => {
      assert.equal(init.method, "POST");
      if (url.endsWith("/v1/temp-media/videos")) return Response.json({ data: { signed_url: "https://storage.test/depth.mp4" } });
      return Response.json({ id, status: "queued", metadata: { url: "https://storage.test/placeholder" } });
    });
    const output = join(f.dir, "result.mp4");
    const args = action === "generate" ? ["--prompt", "test", "-o", output] : ["--source", "input.mp4", "--out", f.dir];
    if (action === "copy") {
      const depthPath = join(f.dir, "depth.mp4");
      await writeFile(depthPath, "video");
      f.deps.prepareVideoCopy = async () => ({ depthPath, duration: 8, referencePaths: [] });
    }
    const result = await f.run(action, "--model", "seedance2", "--no-wait", ...args);
    assert.equal(result.taskId, id);
    assert.equal(result.status, "queued");
    assert.equal(result.artifacts, undefined);
    assert.deepEqual(result.downloadArgs, ["video", "download", "--task-id", id, "--base-url", router,
      ...(action === "generate" ? ["--output", output] : ["--out", f.dir])]);
    assert.equal(result.downloadArgs.includes("fixture"), false);
    assert.deepEqual(await readdir(f.dir), action === "generate" ? [] : ["depth.mp4"]);
    assert.deepEqual(f.calls.map(({ method }) => method), action === "generate" ? ["POST"] : ["POST", "POST"]);
    const resumed = await runCommand(parseArgv(result.downloadArgs), {
      ...f.deps,
      env: { FLATKEY_API_KEY: "recovery-credential" },
      fetch: async (url, init) => {
        assert.equal(new Headers(init.headers).get("authorization"), "Bearer recovery-credential");
        if (url === statusUrl) return Response.json({ status: "completed" });
        assert.equal(url, `${statusUrl}/content`);
        return new Response("finished");
      },
    });
    assert.equal(resumed.artifacts[0].path, action === "generate" ? output : join(f.dir, "video-01.mp4"));
  }
  const human = await fixture(t, () => Response.json({ task_id: id }));
  let stdout = "";
  await main(["video", "generate", "--model", "seedance2", "--prompt", "test", "--no-wait", "--api-key", "fixture", "--base-url", router], {
    ...human.deps, stdout: { write: (value) => { stdout += value; } },
    stderr: { write() {} },
  });
  assert.match(stdout, /task_fixture/);
  assert.match(stdout, /submitted/i);
  assert.match(stdout, /flatkey video download/);
  assert.match(stdout, /--base-url https:\/\/router\.test/);
  assert.doesNotMatch(stdout, /--api-key/);
  assert.doesNotMatch(stdout, /saved/i);
  assert.deepEqual(human.calls.map(({ method }) => method), ["POST"]);
});

test("--no-wait saves synchronous results and returns immediate failures", async (t) => {
  const sync = await fixture(t, () => Response.json({ id, status: "completed", data: [{ b64_json: "bXA0" }] }));
  const output = join(sync.dir, "result.mp4");
  const result = await sync.run("generate", "--model", "seedance2", "--prompt", "test", "--no-wait=true", "--output", output);
  assert.deepEqual(result.artifacts, [{ path: output }]);
  assert.equal(result.downloadArgs, undefined);
  assert.equal(await readFile(output, "utf8"), "mp4");
  const denied = await fixture(t, () => Response.json({ data: { id, status: "failed", error: { message: "render failed" } } }));
  await assert.rejects(denied.run("generate", "--model", "seedance2", "--prompt", "test", "--no-wait"), (error) => {
    assert.equal(error.taskId, id);
    assert.equal(error.taskStatus, "failed");
    assert.match(error.message, /render failed/);
    return true;
  });
  assert.deepEqual(denied.calls.map(({ method }) => method), ["POST"]);
  assert.equal(parseArgv(["video", "copy", "--no-wait=false"]).options.no_wait, false);
});

test("generated video authenticates only the matching router content download", async (t) => {
  for (const signed of [false, true]) {
    const external = "https://storage.test/signed";
    const f = await fixture(t, (url, init) => {
      if (init.method === "POST") return Response.json({ id, status: "queued" });
      if (url === statusUrl) return Response.json({ status: "completed", ...(signed && { url: external }) });
      return new Response("mp4");
    });
    await f.run("generate", "--model", "seedance2", "--prompt", "test", "--out", f.dir);
    assert.deepEqual(f.calls.at(-1), {
      url: signed ? external : `${statusUrl}/content`, method: "GET", authorization: signed ? null : "Bearer fixture",
    });
  }
});

test("Seedance 2.5 first-frame ratio is adaptive, including the aspect alias", async (t) => {
  const opts = { model: "seedance-2.5-pro", first_frame_url: "https://image.test/frame.png" };
  assert.equal(planVideoRequest(opts).body.ratio, "adaptive");
  assert.equal(planVideoRequest({ ...opts, ratio: "adaptive" }).body.ratio, "adaptive");
  assert.throws(() => planVideoRequest({ ...opts, aspect: "3:4" }), /first.frame.*adaptive/i);
  assert.equal(planVideoRequest({ ...opts, model: "seedance2", ratio: "3:4" }).body.ratio, "3:4");
  assert.equal(planVideoRequest({ model: opts.model, image_url: opts.first_frame_url, ratio: "3:4" }).body.ratio, "3:4");
  const f = await fixture(t, () => { throw new Error("unexpected network access"); });
  await assert.rejects(f.run("generate", "--model", opts.model, "--first-frame-url", opts.first_frame_url, "--ratio", "3:4"), /first.frame.*adaptive/i);
  assert.equal(f.calls.length, 0);
});

test("video plans reject inputs that their model transport would silently discard", async (t) => {
  const url = "https://storage.test/ref.mp4";
  const frame = "https://storage.test/frame.png";
  const grok = "grok-imagine-video";
  for (const [input, value, role] of [["--video-url", url, "reference video"], ["--first-frame-url", frame, "first frame"], ["--last-frame", "end.png", "last frame"]]) {
    const f = await fixture(t, () => { throw new Error("unexpected request"); });
    await assert.rejects(f.run("generate", "--model", grok, input, value), new RegExp(role, "i"));
    assert.equal(f.calls.length, 0);
  }
  const account = await fixture(t, (target) => {
    assert.equal(target, `${router}/v1/available_models`);
    return Response.json({ data: [{ id: grok, type: "video" }] });
  });
  await assert.rejects(account.run("generate", "--video-url", url), (error) => {
    assert.equal(error.code, "no_available_model");
    assert.match(error.message, /reference video/i);
    return true;
  });
  assert.deepEqual(account.calls.map(({ method }) => method), ["GET"]);
  assert.throws(() => planVideoRequest({ model: grok, image_url: [frame, frame] }), /one reference image/i);
  assert.deepEqual(planVideoRequest({ model: grok, image_url: frame }).body.images, [frame]);
  for (const model of ["seedance-2-5-pro", "MiniMax-H3"]) {
    const request = planVideoRequest({ model, video_url: url, first_frame_url: frame });
    assert.deepEqual(request.body.content.map(({ role }) => role), ["first_frame", "reference_video"]);
  }
});
