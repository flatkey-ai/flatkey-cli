const COMMANDS = new Set([
  "audio",
  "credits",
  "help",
  "image",
  "login",
  "models",
  "onboard",
  "logout",
  "auth",
  "status",
  "text",
  "version",
  "video",
]);

const GROUP_ACTIONS = new Set(["audio", "auth", "image", "text", "video"]);
const GLOBAL_OPTIONS = new Set(["api_key", "base_url", "dry_run", "help", "json", "output", "out"]);
const COMMAND_OPTIONS = {
  "audio generate": new Set(["model", "prompt", "similarity_boost", "stability", "style", "voice_id"]),
  "audio music": new Set(["music_length_ms", "prompt"]),
  "audio sfx": new Set(["duration", "prompt"]),
  "audio voices": new Set([]),
  "auth status": new Set([]),
  credits: new Set([]),
  help: new Set(["ai", "command"]),
  image: new Set([]),
  "image generate": new Set(["model", "n", "prompt", "quality", "size"]),
  login: new Set(["console_url", "no_open", "open"]),
  logout: new Set([]),
  models: new Set(["type"]),
  onboard: new Set(["api_key"]),
  status: new Set([]),
  text: new Set([]),
  "text generate": new Set(["model", "prompt"]),
  version: new Set([]),
  video: new Set([]),
  "video generate": new Set(["aspect", "duration", "fps", "model", "prompt", "ratio", "resolution"]),
};

export function parseArgv(argv) {
  const [group, maybeAction, ...rest] = argv;
  if (!group) {
    return { group: "help", action: undefined, options: {} };
  }
  if (group === "--help" || group === "-h") {
    return { group: "help", action: undefined, options: {} };
  }
  if (group === "--version" || group === "-v") {
    return { group: "version", action: undefined, options: {} };
  }
  if (!COMMANDS.has(group)) {
    throw new Error(`Unknown command: ${group}`);
  }
  if (group === "help" && maybeAction && !maybeAction.startsWith("--")) {
    return validateCommandOptions({
      group: "help",
      action: undefined,
      options: { command: maybeAction, ...parseOptions(rest) },
    });
  }

  const hasAction = GROUP_ACTIONS.has(group);
  if (hasAction && isHelpToken(maybeAction)) {
    return { group, action: undefined, options: { help: true } };
  }
  if (!hasAction && isHelpToken(maybeAction)) {
    return { group, action: undefined, options: { help: true } };
  }
  const action = hasAction ? maybeAction : undefined;
  const optionTokens = hasAction ? rest : argv.slice(1);
  const hasHelpOption = optionTokens.some((token) => token === "--help" || token === "-h")
    || (optionTokens.length === 1 && optionTokens[0] === "help");
  if (hasHelpOption) {
    return validateCommandOptions({
      group,
      action,
      options: {
        ...parseOptions(optionTokens.filter((token) => token !== "help" && token !== "--help" && token !== "-h")),
        help: true,
      },
    });
  }

  return validateCommandOptions({
    group,
    action,
    options: parseOptions(optionTokens),
  });
}

function isHelpToken(token) {
  return token === "help" || token === "--help" || token === "-h";
}

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "-o") {
      const output = tokens[index + 1];
      if (!output || output.startsWith("-")) {
        throw new Error("Missing value for -o.");
      }
      options.output = output;
      index += 1;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const name = token.slice(2).replaceAll("-", "_");
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      options[name] = true;
      continue;
    }
    options[name] = next;
    index += 1;
  }
  return options;
}

function validateCommandOptions(command) {
  const key = command.action ? `${command.group} ${command.action}` : command.group;
  const allowed = COMMAND_OPTIONS[key] ?? new Set();
  for (const option of Object.keys(command.options)) {
    if (GLOBAL_OPTIONS.has(option) || allowed.has(option)) continue;
    const flag = `--${option.replaceAll("_", "-")}`;
    const helpCommand = command.action
      ? `flatkey ${command.group} ${command.action} --help`
      : `flatkey ${command.group} --help`;
    throw new Error(`Unknown option ${flag} for flatkey ${key}. Run \`${helpCommand}\` to see supported options.`);
  }
  return command;
}

export async function main(argv) {
  const command = parseArgv(argv);
  if (command.options.help) {
    const result = await runCommand(command);
    process.stdout.write(`${formatHuman(result)}\n`);
    return;
  }
  if (command.group === "onboard") {
    const { writeConfig } = await import("./config.js");
    const configPath = await writeConfig({ apiKey: command.options.api_key });
    process.stdout.write(`Saved Flatkey config: ${configPath}\n`);
    return;
  }

  const result = await runCommand(command);
  if (result !== undefined) {
    process.stdout.write(
      command.options.json ? `${JSON.stringify(result)}\n` : `${formatHuman(result)}\n`,
    );
  }
}

export async function runCommand(command, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  if (command.group === "help") {
    const { getAiHelp, getCommandHelp, getHumanHelp } = await import("./help.js");
    if (command.options.command) return getCommandHelp(command.options.command);
    return command.options.ai ? getAiHelp() : getHumanHelp();
  }
  if (command.options.help) {
    const { getCommandHelp } = await import("./help.js");
    return getCommandHelp(command.group, command.action);
  }
  if (command.group === "version") {
    const version = await readPackageVersion();
    return command.options.json ? { version } : version;
  }

  if (command.group === "models") {
    return handleModels(command, deps);
  }

  if (command.group === "login") {
    return handleLogin(command, { ...deps, stdout, stderr });
  }

  if (command.group === "logout") {
    return handleLogout(command, deps);
  }

  if (command.group === "auth") {
    if (command.action !== "status") {
      throw new Error(`Unknown action for auth: ${command.action}`);
    }
    return handleAuthStatus(command, deps);
  }

  if (command.group === "credits" || command.group === "status") {
    return handleUtility(command, deps);
  }

  if (["image", "video", "audio", "text"].includes(command.group)) {
    if (command.group === "audio" && command.action === "voices") {
      return handleVoices(command, deps);
    }
    const validAction = command.group === "audio"
      ? ["generate", "sfx", "music"].includes(command.action)
      : command.action === "generate";
    if (!validAction) {
      throw new Error(`Unknown action for ${command.group}: ${command.action}`);
    }
    return handleGenerate(command, { ...deps, stdout, stderr });
  }

  throw new Error(`Unknown command: ${command.group}`);
}

async function handleLogin(command, deps) {
  const { ensureDeviceId, writeAuthConfig } = await import("./config.js");
  const { createDeviceAuthorization, pollDeviceAuthorization } = await import("./api.js");
  const deviceId = await ensureDeviceId({ configDir: deps.configDir });
  const version = await readPackageVersion();
  const env = deps.env ?? process.env;
  const consoleUrl = firstNonEmpty(command.options.console_url, env.CONSOLE_ORIGIN);
  const authorization = await createDeviceAuthorization({
    consoleUrl,
    deviceId,
    clientName: "flatkey-cli",
    clientVersion: version,
    fetch: deps.fetch,
  });
  const data = authorization?.data ?? authorization;
  if (!data?.device_code || !data?.verification_uri_complete) {
    throw new Error("Flatkey login failed: missing device authorization response.");
  }

  if (!command.options.json) {
    deps.stdout?.write?.(`Open this URL to approve Flatkey CLI:\n${data.verification_uri_complete}\n\n`);
  }
  if (command.options.open !== false && command.options.no_open !== true) {
    await openBrowser(data.verification_uri_complete, deps);
  }

  const initialIntervalMs = Math.max(Number(data.interval ?? 5), 5) * 1000;
  const deadline = Date.now() + Math.max(Number(data.expires_in ?? 600), 1) * 1000;
  const startedAt = Date.now();
  while (Date.now() < deadline) {
    await delay(nextLoginPollDelay(startedAt, initialIntervalMs), deps);
    const poll = await pollDeviceAuthorization({
      consoleUrl,
      deviceCode: data.device_code,
      fetch: deps.fetch,
    });
    const pollData = poll?.data ?? poll;
    if (pollData?.status === "approved") {
      if (!pollData.api_key) {
        throw new Error("Flatkey login approved but no API key was returned.");
      }
      const configPath = await writeAuthConfig({
        apiKey: pollData.api_key,
        auth: {
          deviceId,
          userId: pollData.user_id,
          tokenId: pollData.token_id,
          loginAt: Math.floor(Date.now() / 1000),
        },
        configDir: deps.configDir,
      });
      return command.options.json
        ? { success: true, configPath, tokenId: pollData.token_id, userId: pollData.user_id }
        : `Flatkey CLI authorized. Saved config: ${configPath}`;
    }
    if (pollData?.status === "denied") {
      throw new Error("Flatkey login denied.");
    }
    if (pollData?.status === "expired") {
      throw new Error("Flatkey login expired. Run `flatkey login` again.");
    }
  }
  throw new Error("Flatkey login timed out. Run `flatkey login` again.");
}

function nextLoginPollDelay(startedAt, initialIntervalMs) {
  const elapsed = Date.now() - startedAt;
  const base = elapsed < 30_000
    ? initialIntervalMs
    : elapsed < 120_000
      ? Math.max(initialIntervalMs, 10_000)
      : Math.max(initialIntervalMs, 15_000);
  return base + Math.floor(Math.random() * 800);
}

async function delay(ms, deps = {}) {
  const sleep = deps.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
  return sleep(ms);
}

async function openBrowser(url, deps = {}) {
  if (deps.openBrowser) return deps.openBrowser(url);
  const { spawn } = await import("node:child_process");
  const platform = deps.platform ?? process.platform;
  const command = platform === "darwin"
    ? "open"
    : platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // Printed URL is enough when open is unavailable.
  }
}

function maskKey(key) {
  if (!key) return "";
  if (key.length <= 8) return `${key.slice(0, 2)}****${key.slice(-2)}`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function formatAuthStatus(status) {
  if (!status.authenticated) return "Not authenticated";
  return `Authenticated via ${status.source}: ${status.key}`;
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "");
}

async function handleLogout(command, deps = {}) {
  const { clearSavedApiKey } = await import("./config.js");
  const configPath = await clearSavedApiKey({ configDir: deps.configDir });
  return command.options.json
    ? { success: true, configPath }
    : `Removed saved Flatkey API key from ${configPath}`;
}

async function handleAuthStatus(command, deps) {
  const { readConfig, resolveApiKey } = await import("./config.js");
  const saved = await readConfig(deps.configDir);
  let apiKey;
  try {
    apiKey = await resolveApiKey({
      apiKey: command.options.api_key,
      env: deps.env ?? process.env,
      configDir: deps.configDir,
    });
  } catch {
    apiKey = "";
  }
  const status = {
    authenticated: Boolean(apiKey),
    source: command.options.api_key
      ? "option"
      : (deps.env ?? process.env).FLATKEY_API_KEY
        ? "env"
        : saved?.apiKey
          ? "config"
          : "none",
    key: maskKey(apiKey),
    auth: saved?.auth ?? null,
  };
  return command.options.json ? status : formatAuthStatus(status);
}

async function handleGenerate(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const {
    generateAudio,
    generateAudioMusic,
    generateAudioSfx,
    generateImage,
    generateText,
    generateVideo,
    planAudioMusicRequest,
    planAudioRequest,
    planAudioSfxRequest,
    planImageRequest,
    planTextRequest,
    planVideoRequest,
  } = await import("./api.js");
  const { persistArtifacts } = await import("./artifacts.js");
  const { createAnimation } = await import("./animation.js");
  const apiKey = command.options.dry_run
    ? (command.options.api_key ?? "FLATKEY_API_KEY")
    : await resolveApiKey({
        apiKey: command.options.api_key,
        env: deps.env ?? process.env,
      });
  const options = {
    ...command.options,
    apiKey,
    baseUrl: firstNonEmpty(command.options.base_url, (deps.env ?? process.env).ROUTER_ORIGIN),
    fetch: deps.fetch,
  };
  if (command.options.dry_run) {
    const request = command.group === "image"
      ? planImageRequest(options)
      : command.group === "video"
        ? planVideoRequest(options)
        : command.group === "audio"
          ? command.action === "sfx"
            ? planAudioSfxRequest(options)
            : command.action === "music"
              ? planAudioMusicRequest(options)
              : planAudioRequest(options)
          : planTextRequest(options);
    return { dryRun: true, kind: command.group, request: redactRequest(request) };
  }
  const animation = createAnimation({
    json: Boolean(command.options.json),
    stream: deps.stderr,
  });
  animation.start(command.group);
  try {
    const response = command.group === "image"
      ? await generateImage(options)
      : command.group === "video"
        ? await generateVideo(options)
        : command.group === "audio"
          ? command.action === "sfx"
            ? await generateAudioSfx(options)
            : command.action === "music"
              ? await generateAudioMusic(options)
              : await generateAudio(options)
          : await generateText(options);
    if (command.group === "text") {
      const text = extractText(response);
      const output = await writeTextOutput(text, command.options.output);
      return { kind: command.group, text, output, response };
    }
    const artifacts = await persistArtifacts({
      kind: command.group,
      response,
      outDir: command.options.out ?? "flatkey-output",
      output: command.options.output,
      fetch: deps.fetch,
    });
    return { kind: command.group, artifacts, response: scrubArtifactResponse(response) };
  } finally {
    animation.stop();
  }
}

function scrubArtifactResponse(value) {
  if (Array.isArray(value)) return value.map(scrubArtifactResponse);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.startsWith("data:")) return "<artifact omitted>";
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (["b64_json", "base64", "data"].includes(key) && typeof entry === "string") {
        return [key, "<artifact omitted>"];
      }
      if (["url", "data_url", "dataUrl"].includes(key)
        && typeof entry === "string"
        && entry.startsWith("data:")) {
        return [key, "<artifact omitted>"];
      }
      return [key, scrubArtifactResponse(entry)];
    }),
  );
}

async function handleVoices(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const { getVoices } = await import("./api.js");
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
  });
  return getVoices({
    apiKey,
    baseUrl: firstNonEmpty(command.options.base_url, (deps.env ?? process.env).ROUTER_ORIGIN),
    fetch: deps.fetch,
  });
}

function extractText(response) {
  return response?.choices?.[0]?.message?.content
    ?? response?.output_text
    ?? response?.text
    ?? "";
}

async function writeTextOutput(text, output) {
  if (!output) return undefined;
  output = await expandHomePath(output);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, text);
  return output;
}

async function expandHomePath(path) {
  if (typeof path !== "string") return path;
  if (path !== "~" && !path.startsWith("~/")) return path;
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  if (path === "~") return homedir();
  return join(homedir(), path.slice(2));
}

function redactRequest(request) {
  return {
    ...request,
    headers: Object.fromEntries(
      Object.entries(request.headers ?? {}).map(([key, value]) => [
        key,
        key.toLowerCase() === "authorization" ? "Bearer <redacted>" : value,
      ]),
    ),
  };
}

async function handleUtility(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const { getCredits, getStatus } = await import("./api.js");
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
  });
  const options = {
    apiKey,
    baseUrl: firstNonEmpty(command.options.base_url, (deps.env ?? process.env).CONSOLE_ORIGIN),
    fetch: deps.fetch,
  };
  return command.group === "credits" ? getCredits(options) : getStatus(options);
}

async function handleModels(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const { getModels } = await import("./api.js");
  const { normalizeModels } = await import("./models.js");

  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
  });
  const response = await getModels({
    apiKey,
    baseUrl: firstNonEmpty(command.options.base_url, (deps.env ?? process.env).CONSOLE_ORIGIN),
    fetch: deps.fetch,
  });
  return { models: normalizeModels(response, command.options.type) };
}

function formatHuman(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

async function readPackageVersion() {
  const { readFile } = await import("node:fs/promises");
  const packageUrl = new URL("../package.json", import.meta.url);
  return JSON.parse(await readFile(packageUrl, "utf8")).version;
}
