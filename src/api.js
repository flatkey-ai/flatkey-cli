export const DEFAULT_BASE_URL = "https://router.flatkey.ai";

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
    headers: { "content-type": "application/json" },
    body: {
      contents: [{ parts: [{ text: options.prompt }] }],
    },
  });
}

export function generateVideo(options) {
  return requestJsonFromPlan(options, planVideoRequest(options));
}

export function planVideoRequest(options) {
  return planJsonPost(options, "/v1/videos/generations", cleanObject({
    model: options.model ?? "veo-3",
    prompt: options.prompt,
    duration: parseOptionalInteger(options.duration),
    aspect: options.aspect,
    fps: parseOptionalInteger(options.fps),
  }));
}

export function generateAudio(options) {
  return requestJsonFromPlan(options, planAudioRequest(options));
}

export function planAudioRequest(options) {
  return planJsonPost(options, "/v1/audio/generations", cleanObject({
    model: options.model ?? "tts-1",
    prompt: options.prompt,
    voice: options.voice,
    format: options.format,
  }));
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
  return requestJson(options, "/v1/models");
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
