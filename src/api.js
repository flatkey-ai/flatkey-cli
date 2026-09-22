import { withCliRequestHeaders } from "./requestHeaders.js";

export const DEFAULT_BASE_URL = "https://router.flatkey.ai";
export const DEFAULT_MODELS_BASE_URL = "https://console.flatkey.ai";
export const DEFAULT_CONSOLE_URL = "https://console.flatkey.ai";

export class FlatkeyError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "FlatkeyError";
    this.status = status;
    this.code = code;
  }
}

export async function generateImage(options) {
  return requestJsonFromPlan(options, planImageRequest(options));
}

export async function uploadTempMediaImage(options) {
  return uploadTempMediaByKind(options, "images");
}

export async function uploadTempMediaVideo(options) {
  return uploadTempMediaByKind(options, "videos");
}

async function uploadTempMediaByKind(options, kind) {
  const form = new FormData();
  form.append("file", new Blob([options.file], cleanObject({
    type: options.contentType,
  })), options.filename ?? (kind === "videos" ? "video" : "image"));
  return requestJsonFromPlan(options, planRequest(options, `/v1/temp-media/${kind}`, {
    method: "POST",
    headers: authHeaders(options.apiKey),
    body: form,
  }));
}

export function planImageRequest(options) {
  const model = options.model ?? "nano-banana-pro-preview";
  const mediaInputs = orderedMediaInputs(options);
  assertReferenceLimits(mediaInputs, "image", model);
  if (mediaInputs.some((entry) => entry.kind === "video")) {
    throw new Error("Image models only accept image inputs.");
  }
  const imageUrls = mediaInputs
    .map((entry) => entry.url);
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
      images: imageUrls.length > 0 ? imageUrls : undefined,
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
      contents: [{
        parts: [
          { text: options.prompt },
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      }],
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
  const mediaInputs = orderedMediaInputs(options);
  assertReferenceLimits(mediaInputs, "video", model);
  if (mediaInputs.some((entry) => entry.role === "first_frame" && entry.kind === "video")
    || mediaInputs.some((entry) => entry.role === "last_frame" && entry.kind === "video")) {
    throw new Error("Video first-frame and last-frame inputs must be images.");
  }
  const imageUrls = mediaInputs
    .filter((entry) => entry.kind !== "video")
    .map((entry) => entry.url);
  const videoUrls = mediaInputs
    .filter((entry) => entry.kind === "video")
    .map((entry) => entry.url);
  const ratio = validateOptionalValue(
    optionValue(options, "ratio", "aspect")
      ?? (isMiniMaxModel(model) ? "16:9" : isSeedance25Model(model) ? "adaptive" : undefined),
    ["16:9", "9:16", "4:3", "3:4", "21:9", "1:1", "adaptive"],
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
      : options.duration === undefined && isSeedance25Model(model)
        ? -1
      : parseOptionalFloat(options.duration),
    aspect: ratio,
    ratio,
    resolution,
    quality: resolution,
    fps: parseOptionalInteger(options.fps),
    generate_audio: parseOptionalBoolean(options.generate_audio) ?? true,
    omni_reference_task_type: isSeedance25Model(model) && mediaInputs.some((entry) => entry.kind === "video" || entry.role === "reference_image")
      ? "auto"
      : undefined,
    temp_url: true,
    images: !isSeedanceModel(model) && imageUrls.length > 0 ? imageUrls : undefined,
  });
  const seedanceContent = buildSeedanceContent(options, mediaInputs);
  if ((isSeedanceModel(model) || isMiniMaxModel(model)) && seedanceContent.length > 0) {
    return planJsonPost(options, videoGenerationPath(model, videoUrls), cleanObject({
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
      code: body?.code ?? body?.error?.code,
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
      code: body?.code ?? body?.error?.code,
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

function parseOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`Invalid boolean value: ${value}. Allowed values: true, false`);
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

function videoGenerationPath(model, videoUrls = []) {
  // Seedance keeps text, image, and video-reference content on /v1/videos.
  // The legacy route does not reliably fetch video references upstream.
  if (isSeedanceModel(model)) return "/v1/videos";
  return "/v1/video/generations";
}

function buildSeedanceContent(options, mediaInputs = orderedMediaInputs(options)) {
  const content = [];
  if (options.prompt !== undefined) {
    content.push({ type: "text", text: options.prompt });
  }
  for (const entry of mediaInputs) {
    if (entry.kind === "video") {
      content.push({ type: "video_url", video_url: { url: entry.url }, role: entry.role ?? "reference_video" });
      continue;
    }
    content.push({ type: "image_url", image_url: { url: entry.url }, role: entry.role ?? "reference_image" });
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

function assertReferenceLimits(mediaInputs, kind, model) {
  const imageInputs = mediaInputs.filter((entry) => entry.kind !== "video");
  const videoInputs = mediaInputs.filter((entry) => entry.kind === "video");
  if (isSeedance25Model(model)) {
    if (imageInputs.length > 30) {
      throw new Error(`Too many reference images for flatkey ${kind} generate with Seedance 2.5: maximum 30.`);
    }
    if (videoInputs.length > 10) {
      throw new Error(`Too many reference videos for flatkey ${kind} generate with Seedance 2.5: maximum 10.`);
    }
    return;
  }
  if (imageInputs.length > 5) {
    throw new Error(`Too many reference images for flatkey ${kind} generate: maximum 5.`);
  }
}

function orderedMediaInputs(options) {
  const hidden = Array.isArray(options.__media_inputs) ? options.__media_inputs : [];
  if (hidden.length > 0 && hidden[0] && Object.prototype.hasOwnProperty.call(hidden[0], "url")) {
    return hidden;
  }
  if (hidden.length > 0) {
    return hidden.map((entry) => ({
      ...entry,
      url: entry.url ?? entry.value,
      kind: entry.kind ?? inferMediaKindFromName(entry.name, entry.value),
    }));
  }

  const legacy = [];
  const push = (name, value, kind = "image", role) => {
    for (const item of arrayOption(value)) {
      legacy.push({ name, url: item, kind: kind === "image" ? inferMediaKindFromName(name, item) : kind, role });
    }
  };
  push("file", options.file, "image");
  push("image", options.image, "image");
  push("image_url", options.image_url, "image");
  push("first_frame", options.first_frame, "image", "first_frame");
  push("first_frame_url", options.first_frame_url, "image", "first_frame");
  push("last_frame", options.last_frame, "image", "last_frame");
  push("last_frame_url", options.last_frame_url, "image", "last_frame");
  push("video_url", options.video_url, "video", "reference_video");
  return legacy;
}

function inferMediaKindFromName(name, value) {
  const lowerName = String(name ?? "").toLowerCase();
  if (lowerName.includes("video")) return "video";
  if (typeof value === "string" && /\.(mp4|mov)$/i.test(value)) return "video";
  return "image";
}

function isSeedance25Model(model) {
  return String(model ?? "").toLowerCase().replaceAll(/[-_.]/g, "").includes("seedance25");
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
