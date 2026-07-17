import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlatkeyError,
  generateAudio,
  generateImage,
  generateText,
  generateVideo,
  getCredits,
  getModels,
  getStatus,
  planImageRequest,
  planTextRequest,
  planVideoRequest,
} from "../src/api.js";

function fetchRecorder(responseBody = { ok: true }) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return responseBody;
      },
    };
  };
  return { fetch, calls };
}

test("builds nano image request using gemini-style route", async () => {
  const { fetch, calls } = fetchRecorder({ candidates: [] });

  await generateImage({
    apiKey: "key",
    baseUrl: "https://router.test",
    prompt: "poster",
    fetch,
  });

  assert.equal(
    calls[0].url,
    "https://router.test/v1beta/models/nano-banana-pro-preview:generateContent?key=key",
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer key");
  assert.equal(calls[0].init.headers["x-goog-api-key"], "key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    contents: [{ parts: [{ text: "poster" }] }],
  });
});

test("builds OpenAI image request for gpt image models", async () => {
  const { fetch, calls } = fetchRecorder({ data: [] });

  await generateImage({
    apiKey: "key",
    baseUrl: "https://router.test",
    model: "gpt-image-2",
    prompt: "cover",
    size: "1024x1024",
    n: "2",
    fetch,
  });

  assert.equal(calls[0].url, "https://router.test/v1/images/generations");
  assert.equal(calls[0].init.headers.Authorization, "Bearer key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "gpt-image-2",
    prompt: "cover",
    size: "1024x1024",
    n: 2,
  });
});

test("builds video generation request", async () => {
  const { fetch, calls } = fetchRecorder({ data: [] });

  await generateVideo({
    apiKey: "key",
    baseUrl: "https://router.test",
    model: "veo-3",
    prompt: "walkthrough",
    duration: "8",
    aspect: "16:9",
    fps: "24",
    fetch,
  });

  assert.equal(calls[0].url, "https://router.test/v1/video/generations");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "veo-3",
    prompt: "walkthrough",
    duration: 8,
    aspect: "16:9",
    fps: 24,
  });
});

test("builds seedance2 video generation request", async () => {
  const { fetch, calls } = fetchRecorder({ data: [] });

  await generateVideo({
    apiKey: "key",
    baseUrl: "https://router.test",
    model: "seedance2",
    prompt: "newsroom b-roll",
    fetch,
  });

  assert.equal(calls[0].url, "https://router.test/v1/video/generations");
  assert.equal(JSON.parse(calls[0].init.body).model, "seedance2");
});

test("builds text generation request for gpt-5.5", async () => {
  const { fetch, calls } = fetchRecorder({ choices: [{ message: { content: "copy" } }] });

  await generateText({
    apiKey: "key",
    baseUrl: "https://router.test",
    model: "gpt-5.5",
    prompt: "write headline",
    fetch,
  });

  assert.equal(calls[0].url, "https://router.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "write headline" }],
  });
});

test("builds audio generation request", async () => {
  const { fetch, calls } = fetchRecorder({ data: [] });

  await generateAudio({
    apiKey: "key",
    baseUrl: "https://router.test",
    model: "tts-1",
    prompt: "voiceover",
    voice: "alloy",
    format: "mp3",
    fetch,
  });

  assert.equal(calls[0].url, "https://router.test/v1/audio/generations");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "tts-1",
    prompt: "voiceover",
    voice: "alloy",
    format: "mp3",
  });
});

test("builds credits, status, and models requests", async () => {
  const { fetch, calls } = fetchRecorder({});

  await getCredits({ apiKey: "key", baseUrl: "https://router.test", fetch });
  await getStatus({ apiKey: "key", baseUrl: "https://router.test", fetch });
  await getModels({ apiKey: "key", baseUrl: "https://router.test", fetch });

  assert.equal(calls[0].url, "https://router.test/v1/credits");
  assert.equal(calls[1].url, "https://router.test/v1/status");
  assert.equal(calls[2].url, "https://router.test/v1/available_models");
  assert.equal(calls[0].init.headers.Authorization, "Bearer key");
  assert.equal(calls[2].init.headers.Authorization, "Bearer key");
});

test("plans available model list request from new-api relay route", async () => {
  const { fetch, calls } = fetchRecorder({
    success: true,
    object: "list",
    data: [{ id: "gpt-5.5", object: "model", owned_by: "flatkey" }],
  });

  await getModels({ apiKey: "env-key", fetch });

  assert.equal(calls[0].url, "https://console.flatkey.ai/v1/available_models");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer env-key");
});

test("honors explicit base url for available model list request", async () => {
  const { fetch, calls } = fetchRecorder({ success: true, object: "list", data: [] });

  await getModels({ apiKey: "env-key", baseUrl: "https://router.test", fetch });

  assert.equal(calls[0].url, "https://router.test/v1/available_models");
});

test("plans dry-run requests for target media models", () => {
  assert.equal(planImageRequest({
    apiKey: "key",
    model: "gpt-image-2",
    prompt: "poster",
  }).url, "https://router.flatkey.ai/v1/images/generations");

  assert.match(planImageRequest({
    apiKey: "key",
    model: "nano-banana-pro-preview",
    prompt: "poster",
  }).url, /\/v1beta\/models\/nano-banana-pro-preview:generateContent\?key=key$/);

  assert.equal(planVideoRequest({
    apiKey: "key",
    model: "seedance2",
    prompt: "clip",
  }).body.model, "seedance2");

  assert.equal(planTextRequest({
    apiKey: "key",
    model: "gpt-5.5",
    prompt: "headline",
  }).body.model, "gpt-5.5");
});

test("throws FlatkeyError with API message on HTTP failure", async () => {
  const fetch = async () => ({
    ok: false,
    status: 402,
    async json() {
      return { error: { message: "credits exhausted" } };
    },
  });

  await assert.rejects(
    () => getCredits({ apiKey: "key", baseUrl: "https://router.test", fetch }),
    (error) => error instanceof FlatkeyError && /credits exhausted/.test(error.message),
  );
});
