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
