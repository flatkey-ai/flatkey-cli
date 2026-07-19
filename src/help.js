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
- flatkey audio generate --prompt "<text>" --json [--voice-id <voice_id>] [--model eleven_multilingual_v2] [--output speech.mp3]
- flatkey audio sfx --prompt "<sound>" --json [--duration <seconds>] [--output sfx.mp3]
- flatkey audio music --prompt "<music prompt>" --json [--music-length-ms <ms>] [--output music.mp3]
- flatkey audio voices --json
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
- Unknown voice: run flatkey audio voices --json, then retry with a listed voice_id.
- API failure: inspect stderr JSON or HTTP message, then retry only after fixing request or credits.
`;
}

export function getHumanHelp() {
  return `Usage: flatkey <command> [options]

Commands:
  onboard --api-key <key>        Save Flatkey API key
  image generate --prompt <txt>  Generate image
  video generate --prompt <txt>  Generate video
  audio generate --prompt <txt>  Generate speech with ElevenLabs voices
  audio sfx --prompt <txt>       Generate sound effects
  audio music --prompt <txt>     Generate music
  audio voices                   List available voices
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
