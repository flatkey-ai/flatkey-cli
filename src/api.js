import { withCliRequestHeaders } from "./requestHeaders.js";

export const DEFAULT_BASE_URL = "https://router.flatkey.ai";
export const DEFAULT_MODELS_BASE_URL = "https://console.flatkey.ai";
export const DEFAULT_CONSOLE_URL = "https://console.flatkey.ai";

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

export async function uploadTempMediaImage(options) {
  const form = new FormData();
  form.append("file", new Blob([options.file], cleanObject({
    type: options.contentType,
  })), options.filename ?? "image");
  return requestJsonFromPlan(options, planRequest(options, "/v1/temp-media/images", {
    method: "POST",
    headers: authHeaders(options.apiKey),
    body: form,
  }));
}

export function planImageRequest(options) {
  const model = options.model ?? "nano-banana-pro-preview";
  if (model.startsWith("gpt")) {
    const responseFormat = options.response_format ?? options.responseFormat ?? "url";
    const tempUrl = options.temp_url ?? options.tempUrl;
    return planJsonPost(options, "/v1/images/generations", cleanObject({
      model,
      prompt: options.prompt,
      size: options.size,
      n: parseOptionalInteger(options.n),
      quality: options.quality,
      response_format: responseFormat,
      temp_url: tempUrl ?? true,
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
      temp_url: true,
    },
  });
}

export function generateVideo(options) {
  return requestJsonFromPlan(options, planVideoRequest(options));
}

export function getVideo(options, taskId) {
  return requestJsonFromPlan(options, planVideoStatusRequest(options, taskId));
}

export function planVideoRequest(options) {
  const model = options.model ?? "seedance-2.0-pro";
  const imageUrls = [
    ...arrayOption(options.image_url),
    ...arrayOption(options.imageUrl),
    ...arrayOption(options.first_frame_url),
    ...arrayOption(options.firstFrameUrl),
    ...arrayOption(options.last_frame_url),
    ...arrayOption(options.lastFrameUrl),
  ];
  const ratio = validateOptionalValue(
    optionValue(options, "ratio", "aspect") ?? (isMiniMaxModel(model) ? "16:9" : undefined),
    ["16:9", "9:16", "4:3", "3:4", "21:9", "1:1"],
    "ratio",
  );
  const resolution = validateOptionalValue(
    options.resolution ?? (isMiniMaxModel(model) ? "768P" : undefined),
    isMiniMaxModel(model) ? ["768P", "2K"] : ["480p", "720p", "1080p"],
    "resolution",
  );
  const basePayload = cleanObject({
    model,
    prompt: options.prompt,
    duration: options.duration === undefined && isMiniMaxModel(model)
      ? 5
      : parseOptionalInteger(options.duration),
    aspect: ratio,
    ratio,
    resolution,
    quality: resolution,
    fps: parseOptionalInteger(options.fps),
    temp_url: true,
    images: !isSeedanceModel(model) && imageUrls.length > 0 ? imageUrls : undefined,
  });
  const seedanceContent = buildSeedanceContent(options);
  if ((isSeedanceModel(model) || isMiniMaxModel(model)) && seedanceContent.length > 0) {
    return planJsonPost(options, "/v1/video/generations", cleanObject({
      ...basePayload,
      content: seedanceContent,
    }));
  }
  return planJsonPost(options, "/v1/video/generations", basePayload);
}

export function planVideoStatusRequest(options, taskId) {
  return planRequest(options, `/v1/videos/${encodeURIComponent(taskId)}`);
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
  return requestJson({
    ...options,
    baseUrl: options.baseUrl ?? DEFAULT_CONSOLE_URL,
  }, "/v1/credits");
}

export function getStatus(options) {
  return requestJson({
    ...options,
    baseUrl: options.baseUrl ?? DEFAULT_CONSOLE_URL,
  }, "/v1/status");
}

export function getModels(options) {
  return requestJson({
    ...options,
    baseUrl: options.baseUrl ?? DEFAULT_MODELS_BASE_URL,
  }, "/v1/available_models");
}

export async function createDeviceAuthorization(options) {
  return requestJson({
    ...options,
    baseUrl: options.consoleUrl ?? DEFAULT_CONSOLE_URL,
  }, "/api/cli/device_authorizations", {
    method: "POST",
    body: JSON.stringify({
      client_name: options.clientName ?? "flatkey-cli",
      client_version: options.clientVersion,
      device_id: options.deviceId,
    }),
  });
}

export async function pollDeviceAuthorization(options) {
  return requestJson({
    ...options,
    baseUrl: options.consoleUrl ?? DEFAULT_CONSOLE_URL,
  }, "/api/cli/device_authorizations/token", {
    method: "POST",
    body: JSON.stringify({
      device_code: options.deviceCode,
    }),
  });
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
    headers: withCliRequestHeaders(init.headers ?? authHeaders(options.apiKey)),
    body: init.body,
  };
}

async function requestJsonFromPlan(options, plan) {
  const fetchImpl = options.fetch ?? fetch;
  const request = {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined
      ? undefined
      : isFormData(plan.body)
        ? plan.body
        : JSON.stringify(plan.body),
  };
  logRequest(options, plan.url, request);
  const response = await fetchImpl(plan.url, request);
  logResponse(options, response);
  const body = await readJson(response);
  logResponseBody(options, body);
  if (!response.ok || body?.success === false) {
    throw new FlatkeyError(extractErrorMessage(body, response.status), {
      status: response.status,
    });
  }
  return body;
}

function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

async function requestBinaryArtifactFromPlan(options, plan) {
  const fetchImpl = options.fetch ?? fetch;
  const request = {
    method: plan.method,
    headers: plan.headers,
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  };
  logRequest(options, plan.url, request);
  const response = await fetchImpl(plan.url, request);
  logResponse(options, response);
  if (!response.ok) {
    const body = await readJson(response);
    logResponseBody(options, body);
    throw new FlatkeyError(extractErrorMessage(body, response.status), {
      status: response.status,
    });
  }
  return {
    data: [{ data: Buffer.from(await response.arrayBuffer()).toString("base64") }],
  };
}

function logRequest(options, url, request) {
  if (!options?.verbose) return;
  const safeHeaders = redactHeaders(request.headers);
  const safeBody = request.body === undefined
    ? undefined
    : isFormData(request.body)
      ? "<form-data>"
      : request.body;
  options.verboseLog?.(`-> ${request.method} ${url}`);
  options.verboseLog?.(`headers: ${JSON.stringify(safeHeaders)}`);
  if (safeBody !== undefined) {
    options.verboseLog?.(`body: ${safeBody}`);
  }
}

function logResponse(options, response) {
  if (!options?.verbose) return;
  options.verboseLog?.(`<- ${response.status} ${response.statusText || ""}`.trim());
}

function logResponseBody(options, body) {
  if (!options?.verbose) return;
  options.verboseLog?.(`response: ${truncateLogValue(JSON.stringify(body))}`);
}

function redactHeaders(headers) {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [
    key,
    key.toLowerCase() === "authorization" ? "Bearer <redacted>" : `${value}`,
  ]));
}

function truncateLogValue(value) {
  if (value === undefined) return "";
  return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
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

function isSeedanceModel(model) {
  return /seedance/i.test(model);
}

function isMiniMaxModel(model) {
  return /^minimax-h3$/i.test(model);
}

function buildSeedanceContent(options) {
  const content = [];
  if (options.prompt !== undefined) {
    content.push({ type: "text", text: options.prompt });
  }
  for (const url of arrayOption(options.image_url)) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  for (const url of arrayOption(options.imageUrl)) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  for (const url of arrayOption(options.first_frame_url)) {
    content.push({ type: "image_url", image_url: { url }, role: "first_frame" });
  }
  for (const url of arrayOption(options.firstFrameUrl)) {
    content.push({ type: "image_url", image_url: { url }, role: "first_frame" });
  }
  for (const url of arrayOption(options.last_frame_url)) {
    content.push({ type: "image_url", image_url: { url }, role: "last_frame" });
  }
  for (const url of arrayOption(options.lastFrameUrl)) {
    content.push({ type: "image_url", image_url: { url }, role: "last_frame" });
  }
  for (const url of arrayOption(options.video_url)) {
    content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
  }
  for (const url of arrayOption(options.videoUrl)) {
    content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
  }
  return content;
}

function arrayOption(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
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
  const message = typeof body?.error?.message === "string"
    ? body.error.message
    : typeof body?.message === "string"
      ? body.message
      : undefined;
  if (isAuthTokenError(message)) return missingApiKeyMessage();
  if (message) return message;
  return `Flatkey API request failed with HTTP ${status}`;
}

function isAuthTokenError(message) {
  return message === "Token not provided" || /^Invalid token\b/i.test(message ?? "");
}

function missingApiKeyMessage() {
  return "Missing or invalid Flatkey API key. Run `flatkey login`, or create a key at https://console.flatkey.ai/keys and run `flatkey onboard --api-key <key>`.";
}
