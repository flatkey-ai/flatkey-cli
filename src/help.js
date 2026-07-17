export function getAiHelp() {
  return `Flatkey CLI protocol for agents

Setup:
- Prefer env: FLATKEY_API_KEY=<key>
- Or save key: flatkey onboard --api-key <key>
- Use --json for machine-readable output.

JSON mode:
- stdout contains only JSON.
- stderr contains JSON errors on failure.
- ASCII animation and human logs are disabled.

Commands:
- flatkey image generate --prompt "<prompt>" --json [--model <model>] [--output image.png]
- flatkey video generate --prompt "<prompt>" --json [--model seedance2] [--output video.mp4]
- flatkey audio generate --prompt "<prompt>" --json [--model tts-1] [--output audio.mp3]
- flatkey text generate --prompt "<prompt>" --json [--model gpt-5.5] [--output text.txt]
- flatkey credits --json
- flatkey status --json
- flatkey models --json [--type image|video|audio|text]
- flatkey help --ai

Environment:
- FLATKEY_API_KEY: Flatkey API key.
- Default router: https://router.flatkey.ai

Recovery:
- Missing key: run flatkey onboard --api-key <key> or set FLATKEY_API_KEY.
- Unknown model: run flatkey models --json, then retry with a listed model id.
- API failure: inspect stderr JSON or HTTP message, then retry only after fixing request or credits.
`;
}

export function getHumanHelp() {
  return `Usage: flatkey <command> [options]

Commands:
  onboard --api-key <key>        Save Flatkey API key
  image generate --prompt <txt>  Generate image
  video generate --prompt <txt>  Generate video
  audio generate --prompt <txt>  Generate audio
  text generate --prompt <txt>   Generate text
  credits                        Show remaining credits
  status                         Show usage/status
  models                         List available models
  help --ai                      Print agent-focused usage guide

Global options:
  --json                         Print machine-readable JSON
  --output, -o <file>             Write generated output to a local file
  --base-url <url>               Override Flatkey router URL
`;
}
