export function getAiHelp() {
  return `Flatkey CLI protocol for agents

Setup:
- Prefer browser auth: flatkey login
- Or env: FLATKEY_API_KEY=<key>
- Create a key at https://console.flatkey.ai/keys
- Or save key: flatkey onboard --api-key <key>
- Use --json for machine-readable output.

JSON mode:
- stdout contains only JSON.
- stderr contains JSON errors on failure.
- ASCII animation and human logs are disabled.

Commands:
- flatkey image generate --prompt "<prompt>" --json [--model <model>] [--output image.png]
- flatkey video generate --prompt "<prompt>" --json [--model seedance2] [--ratio 16:9] [--resolution 720p] [--output video.mp4]
- flatkey audio generate --prompt "<text>" --json [--voice-id <voice_id>] [--model eleven_multilingual_v2] [--output speech.mp3]
- flatkey audio sfx --prompt "<sound>" --json [--duration <seconds>] [--output sfx.mp3]
- flatkey audio music --prompt "<music prompt>" --json [--music-length-ms <ms>] [--output music.mp3]
- flatkey audio voices --json
- flatkey text generate --prompt "<prompt>" --json [--model gpt-5.5] [--output text.txt]
- flatkey credits --json
- flatkey status --json
- flatkey models --json [--type image|video|audio|text]
- flatkey login [--no-open] [--console-url <url>]
- flatkey logout
- flatkey auth status --json
- flatkey help --ai

Environment:
- FLATKEY_API_KEY: Flatkey API key.
- ROUTER_ORIGIN: Override generation router origin, e.g. staging router.
- CONSOLE_ORIGIN: Override console API origin, e.g. staging console.
- Default router: https://router.flatkey.ai

Recovery:
- Missing key: create one at https://console.flatkey.ai/keys, then run flatkey onboard --api-key <key> or set FLATKEY_API_KEY.
- Unknown model: run flatkey models --json, then retry with a listed model id.
- Unknown voice: run flatkey audio voices --json, then retry with a listed voice_id.
- API failure: inspect stderr JSON or HTTP message, then retry only after fixing request or credits.
`;
}

export function getHumanHelp() {
  return `Usage: flatkey <command> [options]

Commands:
  login                         Authorize CLI in browser
  logout                        Remove saved Flatkey API key
  auth status                    Show saved auth state
  onboard --api-key <key>        Save Flatkey API key from https://console.flatkey.ai/keys
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

Environment:
  ROUTER_ORIGIN                  Override generation router origin
  CONSOLE_ORIGIN                 Override console API origin
  --console-url <url>            Override Flatkey console URL for login

Video options:
  --ratio <value>                 16:9, 9:16, 4:3, 3:4, 21:9, or 1:1
  --resolution <value>            480p, 720p, or 1080p
`;
}

const COMMAND_HELP = {
  audio: `Usage: flatkey audio <action> [options]

Actions:
  generate --prompt <txt>        Generate speech
  sfx --prompt <txt>             Generate sound effects
  music --prompt <txt>           Generate music
  voices                         List available voices

Options:
  --json                         Print machine-readable JSON
  --output, -o <file>             Write generated output to a local file
  --model <model>                Override model id
  --voice-id <voice_id>           Voice id for speech generation
  --duration <seconds>            Duration for sound effects
  --music-length-ms <ms>          Music length in milliseconds
  --help                         Show audio help`,
  "audio generate": `Usage: flatkey audio generate --prompt <txt> [options]

Options:
  --voice-id <voice_id>           Voice id
  --model <model>                Model id, default eleven_multilingual_v2
  --stability <0..1>              Voice stability
  --similarity-boost <0..1>       Voice similarity boost
  --style <0..1>                 Voice style
  --output, -o <file>             Write speech file
  --json                         Print machine-readable JSON`,
  "audio music": `Usage: flatkey audio music --prompt <txt> [options]

Options:
  --music-length-ms <ms>          Music length in milliseconds
  --output, -o <file>             Write music file
  --json                         Print machine-readable JSON`,
  "audio sfx": `Usage: flatkey audio sfx --prompt <txt> [options]

Options:
  --duration <seconds>            Sound effect duration
  --output, -o <file>             Write sound effect file
  --json                         Print machine-readable JSON`,
  "audio voices": `Usage: flatkey audio voices [options]

Options:
  --json                         Print machine-readable JSON`,
  credits: `Usage: flatkey credits [options]

Options:
  --json                         Print machine-readable JSON`,
  auth: `Usage: flatkey auth <action> [options]

Actions:
  status                         Show saved auth state

Options:
  --json                         Print machine-readable JSON`,
  "auth status": `Usage: flatkey auth status [options]

Options:
  --json                         Print machine-readable JSON`,
  help: `Usage: flatkey help [command] [options]

Options:
  --ai                           Print agent-focused usage guide`,
  image: `Usage: flatkey image generate --prompt <txt> [options]

Options:
  --model <model>                Model id
  --size <size>                  Image size for OpenAI-style image models
  --quality <quality>             Image quality for supported models
  --n <count>                    Number of images for supported models
  --output, -o <file>             Write image file
  --json                         Print machine-readable JSON`,
  "image generate": `Usage: flatkey image generate --prompt <txt> [options]

Options:
  --model <model>                Model id
  --size <size>                  Image size for OpenAI-style image models
  --quality <quality>             Image quality for supported models
  --n <count>                    Number of images for supported models
  --output, -o <file>             Write image file
  --json                         Print machine-readable JSON`,
  models: `Usage: flatkey models [options]

Options:
  --type <type>                  Filter: image, video, audio, or text
  --json                         Print machine-readable JSON`,
  login: `Usage: flatkey login [options]

Options:
  --no-open                      Print approval URL without opening a browser
  --console-url <url>            Override Flatkey console URL
  --json                         Print machine-readable JSON`,
  logout: `Usage: flatkey logout [options]

Options:
  --json                         Print machine-readable JSON`,
  onboard: `Usage: flatkey onboard --api-key <key>

Create a Flatkey API key first:
  https://console.flatkey.ai/keys

Options:
  --api-key <key>                Flatkey API key to save`,
  status: `Usage: flatkey status [options]

Options:
  --json                         Print machine-readable JSON`,
  text: `Usage: flatkey text generate --prompt <txt> [options]

Options:
  --model <model>                Model id, default gpt-5.5
  --output, -o <file>             Write text file
  --json                         Print machine-readable JSON`,
  "text generate": `Usage: flatkey text generate --prompt <txt> [options]

Options:
  --model <model>                Model id, default gpt-5.5
  --output, -o <file>             Write text file
  --json                         Print machine-readable JSON`,
  version: `Usage: flatkey version [options]

Aliases:
  flatkey --version
  flatkey -v

Options:
  --json                         Print machine-readable JSON`,
  video: `Usage: flatkey video generate --prompt <txt> [options]

Options:
  --model <model>                Model id, default veo-3
  --duration <seconds>            Video duration
  --ratio <value>                 16:9, 9:16, 4:3, 3:4, 21:9, or 1:1
  --resolution <value>            480p, 720p, or 1080p
  --fps <fps>                    Frames per second
  --output, -o <file>             Write video file
  --json                         Print machine-readable JSON`,
  "video generate": `Usage: flatkey video generate --prompt <txt> [options]

Options:
  --model <model>                Model id, default veo-3
  --duration <seconds>            Video duration
  --ratio <value>                 16:9, 9:16, 4:3, 3:4, 21:9, or 1:1
  --resolution <value>            480p, 720p, or 1080p
  --fps <fps>                    Frames per second
  --output, -o <file>             Write video file
  --json                         Print machine-readable JSON`,
};

export function getCommandHelp(group, action) {
  const key = action ? `${group} ${action}` : group;
  const help = COMMAND_HELP[key];
  if (!help) {
    throw new Error(`Unknown help topic: ${key}`);
  }
  return help;
}
