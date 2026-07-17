const BUNDLED_MODELS = [
  { id: "nano-banana-pro-preview", type: "image" },
  { id: "nano-banana-flash", type: "image" },
  { id: "gpt-image-2", type: "image" },
  { id: "veo-3", type: "video" },
  { id: "veo-3-fast", type: "video" },
  { id: "seedance2", type: "video" },
  { id: "gpt-5.5", type: "text" },
  { id: "tts-1", type: "audio" },
  { id: "gpt-4o-mini-tts", type: "audio" },
];

export function getBundledModels(type) {
  return BUNDLED_MODELS
    .filter((model) => !type || model.type === type)
    .map((model) => ({ ...model, source: "bundled" }));
}

export function normalizeModels(response, type) {
  const rawModels = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.models)
      ? response.models
      : [];

  return rawModels
    .map((model) => ({
      id: model.id,
      type: model.type ?? inferType(model),
      source: "remote",
    }))
    .filter((model) => model.id && model.type)
    .filter((model) => !type || model.type === type);
}

function inferType(model) {
  if (model.capabilities?.includes("video")) return "video";
  if (model.capabilities?.includes("audio")) return "audio";
  if (model.capabilities?.includes("image")) return "image";
  if (model.capabilities?.includes("text")) return "text";
  if (/image|nano-banana/i.test(model.id)) return "image";
  if (/seedance|veo|sora|video/i.test(model.id)) return "video";
  if (/tts|audio|voice|speech/i.test(model.id)) return "audio";
  if (model.object === "model") return "text";
  return undefined;
}
