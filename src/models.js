export function imageModelFamily(model) {
  const name = String(model ?? "").trim().toLowerCase().split("/").at(-1);
  if (/^(?:gpt(?:-?4o)?|chatgpt)-image(?:$|[-._])/.test(name)) return "gpt";
  if (/^nano-?banana(?:$|[-._\d])/.test(name)
    || (/^gemini-/.test(name) && /[-._]image(?:$|[-._])/.test(name))) return "gemini";
  if (/(?:^|[-._:])seedream(?:$|[-._\d])/.test(name)) return "seedream";
  if (/^grok-(?:imagine|\d+(?:\.\d+)*)-image(?:$|[-._])/.test(name)) return "grok";
  return undefined;
}

export const PREFERRED_MEDIA_MODELS = {
  image: ["nano-banana-pro-preview", "gpt-image-2", "gpt-image-2.6", "seedream-5-0-pro", "grok-imagine-image-2.0", "grok-imagine-image"],
  video: ["seedance-2.0-pro", "seedance2", "seedance-2-5-pro", "MiniMax-H3"],
};

export function normalizeModels(response, type) {
  const rawModels = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response?.models)
      ? response.models
      : [];

  return rawModels
    .filter((model) => typeof model?.id === "string" && model.id.length > 0)
    .map((model) => {
      const kind = model.type ?? inferType(model);
      return {
        id: model.id, type: kind, source: "remote",
        ...(kind === "image" ? { cliSupported: Boolean(imageModelFamily(model.id)) } : {}),
      };
    })
    .filter((model) => model.type)
    .filter((model) => !type || model.type === type);
}

export function mediaModelCandidates(response, kind, options) {
  const available = normalizeModels(response, kind).filter((model) => model.cliSupported !== false).map((model) => model.id);
  if (kind === "image" && (options.output_format === "gif" || options.frame_count || options.frame_duration_ms || options.complexity)) {
    return available.filter((id) => /^gpt-image-2\.6(?:$|-)/i.test(id.split("/").at(-1)));
  }
  const preferred = PREFERRED_MEDIA_MODELS[kind].filter((id) => available.includes(id));
  return [...new Set([...preferred, ...available])];
}

function inferType(model) {
  if (model.capabilities?.includes("video")) return "video";
  if (model.capabilities?.includes("audio")) return "audio";
  if (model.capabilities?.includes("image")) return "image";
  if (model.capabilities?.includes("text")) return "text";
  if (model.supported_endpoint_types?.includes("image-generation") || imageModelFamily(model.id)) return "image";
  if (model.supported_endpoint_types?.includes("video") || model.supported_endpoint_types?.includes("openai-video")) return "video";
  if (/seedance|veo|sora|video|minimax-h3/i.test(model.id)) return "video";
  if (/image/i.test(model.id)) return "image";
  if (/tts|audio|voice|speech/i.test(model.id)) return "audio";
  if (model.object === "model") return "text";
  return undefined;
}
