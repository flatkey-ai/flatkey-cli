export const DEFAULT_BASE_URL = "https://router.flatkey.ai";
export const DEFAULT_MODELS_BASE_URL = "https://console.flatkey.ai";

export class FlatkeyError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "FlatkeyError";
    this.status = status;
  }
}

export async function generateImage(options) {
  return requestJsonFromPlan(options, planImageRequest(options));
}

export function planImageRequest(options) {
  const model = options.model ?? "nano-banana-pro-preview";
  if (model.startsWith("gpt")) {
    return planJsonPost(options, "/v1/images/generations", cleanObject({
      model,
      prompt: options.prompt,
      size: options.size,
      n: parseOptionalInteger(options.n),
      quality: options.quality,
    }));
  }

  const path = `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  return planRequest(options, path, {
    method: "POST",
    headers: {
      ...jsonHeaders(options.apiKey),
      "x-goog-api-key": options.apiKey,
    },
    body: {
      contents: [{ parts: [{ text: options.prompt }] }],
    },
  });
}

export function generateVideo(options) {
  return requestJsonFromPlan(options, planVideoRequest(options));
}

export function planVideoRequest(options) {
  const ratio = validateOptionalValue(
    optionValue(options, "ratio", "aspect"),
    ["16:9", "9:16", "4:3", "3:4", "21:9", "1:1"],
    "ratio",
  );
  const resolution = validateOptionalValue(
    options.resolution,
    ["480p", "720p", "1080p"],
    "resolution",
  );
  return planJsonPost(options, "/v1/video/generations", cleanObject({
    model: options.model ?? "veo-3",
    prompt: options.prompt,
    duration: parseOptionalInteger(options.duration),
    aspect: ratio,
    ratio,
    resolution,
    quality: resolution,
    fps: parseOptionalInteger(options.fps),
  }));
}

export function generateAudio(options) {
  return requestBinaryArtifactFromPlan(options, planAudioRequest(options));
}

export function planAudioRequest(options) {
  const voiceId = optionValue(options, "voiceId", "voice_id") ?? "EXAVITQu4vr4xnSDxMaL";
  return planJsonPost(options, `/v1/text-to-speech/${encodeURIComponent(voiceId)}`, cleanObject({
    text: options.text ?? options.prompt,
    model_id: options.model ?? options.model_id ?? "eleven_multilingual_v2",
    voice_settings: cleanObject({
      stability: parseOptionalFloat(options.stability),
      similarity_boost: parseOptionalFloat(optionValue(options, "similarityBoost", "similarity_boost")),
      style: parseOptionalFloat(options.style),
    }),
  }));
}

export function generateAudioSfx(options) {
  return requestBinaryArtifactFromPlan(options, planAudioSfxRequest(options));
}

export function planAudioSfxRequest(options) {
  return planJsonPost(options, "/v1/sound-generation", cleanObject({
    text: options.text ?? options.prompt,
    duration_seconds: parseOptionalFloat(optionValue(options, "durationSeconds", "duration_seconds", "duration")),
  }));
}

export function generateAudioMusic(options) {
  return requestBinaryArtifactFromPlan(options, planAudioMusicRequest(options));
}

export function planAudioMusicRequest(options) {
  return planJsonPost(options, "/v1/music", cleanObject({
    prompt: options.prompt,
    music_length_ms: parseOptionalInteger(optionValue(options, "musicLengthMs", "music_length_ms")),
  }));
}

export function getVoices(options) {
  return requestJson(options, "/v1/voices");
}

export function planVoicesRequest(options) {
  return planRequest(options, "/v1/voices");
}

export function generateText(options) {
  return requestJsonFromPlan(options, planTextRequest(options));
}

export function planTextRequest(options) {
  return planJsonPost(options, "/v1/chat/completions", {
    model: options.model ?? "gpt-5.5",
    messages: [{ role: "user", content: options.prompt }],
  });
}

export function getCredits(options) {
  return requestJson(options, "/v1/credits");
}

export function getStatus(options) {
  return requestJson(options, "/v1/status");
}

export function getModels(options) {
  return requestJson({
    ...options,
    baseUrl: options.baseUrl ?? DEFAULT_MODELS_BASE_URL,
  }, "/v1/available_models");
}

async function postJson(options, path, payload) {
  return requestJsonFromPlan(options, planJsonPost(options, path, payload));
}

function planJsonPost(options, path, payload) {
  return planRequest(options, path, {
    method: "POST",
    headers: jsonHeaders(options.apiKey),
    body: payload,
  });
}

function planRequest(options, path, init = {}) {
  return {
    url: buildUrl(options.baseUrl, path),
    method: init.method ?? "GET",
    headers: init.headers ?? authHeaders(options.apiKey),
    body: init.body,
  };
}

async function requestJsonFromPlan(options, plan) {
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new FlatkeyError(extractErrorMessage(body, response.status), {
      status: response.status,
    });
  }
  return body;
}

async function requestBinaryArtifactFromPlan(options, plan) {
  const fetchImpl = options.fetch ?? fetch;
  const response = await fetchImpl(plan.url, {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  if (!response.ok) {
    const body = await readJson(response);
    throw new FlatkeyError(extractErrorMessage(body, response.status), {
      status: response.status,
    });
  }
  return {
    data: [{ data: Buffer.from(await response.arrayBuffer()).toString("base64") }],
  };
}

async function requestJson(options, path, init = {}) {
  return requestJsonFromPlan(options, planRequest(options, path, {
    method: init.method ?? "GET",
    headers: {
      ...authHeaders(options.apiKey),
      ...init.headers,
    },
    body: init.body ? JSON.parse(init.body) : undefined,
  }));
}

function buildUrl(baseUrl = DEFAULT_BASE_URL, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function authHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function jsonHeaders(apiKey) {
  return {
    ...authHeaders(apiKey),
    "content-type": "application/json",
  };
}

function parseOptionalInteger(value) {
  if (value === undefined) return undefined;
  return Number.parseInt(value, 10);
}

function parseOptionalFloat(value) {
  if (value === undefined) return undefined;
  return Number.parseFloat(value);
}

function optionValue(options, ...keys) {
  for (const key of keys) {
    if (options[key] !== undefined) return options[key];
  }
  return undefined;
}

function validateOptionalValue(value, allowed, name) {
  if (value === undefined) return undefined;
  if (allowed.includes(value)) return value;
  throw new Error(`Invalid ${name}: ${value}. Allowed values: ${allowed.join(", ")}`);
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function extractErrorMessage(body, status) {
  if (typeof body?.error?.message === "string") return body.error.message;
  if (typeof body?.message === "string") return body.message;
  return `Flatkey API request failed with HTTP ${status}`;
}
