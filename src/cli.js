import { join } from "node:path";
import { mediaModelCandidates, PREFERRED_MEDIA_MODELS } from "./models.js";
import {
  DEFAULT_BASE_URL, DEFAULT_CONSOLE_URL, fetchVideoContent, fetchWithRetry, FlatkeyError, getModels, getResponseMetadata, getVideo, planVideoContentRequest,
  planVideoStatusRequest, responseError,
} from "./api.js";
import { persistArtifacts } from "./artifacts.js";

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
const BOOLEAN_OPTIONS = new Set(["ai", "dry_run", "help", "json", "keep_depth", "no_open", "no_wait", "open", "pricing", "verbose"]);
const GLOBAL_OPTIONS = new Set(["api_key", "base_url", "console_url", "dry_run", "help", "json", "output", "out", "verbose"]);
const REPEATABLE_OPTIONS = new Set(["image", "image_url", "video_url"]);
const MEDIA_INPUT_OPTIONS = new Set(["file", "image", "image_url", "video_url", "first_frame", "first_frame_url", "last_frame", "last_frame_url"]);
const MAX_REFERENCE_IMAGES = 5;
const COMMAND_OPTIONS = {
  "audio generate": new Set(["model", "prompt", "similarity_boost", "stability", "style", "voice_id"]),
  "audio music": new Set(["music_length_ms", "prompt"]),
  "audio sfx": new Set(["duration", "prompt"]),
  "audio voices": new Set([]),
  "auth status": new Set([]),
  credits: new Set([]),
  help: new Set(["ai", "command"]),
  image: new Set([]),
  "image generate": new Set(["complexity", "file", "frame_count", "frame_duration_ms", "image", "image_url", "model", "n", "output_format", "prompt", "quality", "size"]),
  "image upload": new Set(["file"]),
  login: new Set(["console_url", "no_open", "open"]),
  logout: new Set([]),
  models: new Set(["type", "pricing"]),
  onboard: new Set(["api_key"]),
  status: new Set([]),
  text: new Set([]),
  "text generate": new Set(["model", "prompt"]),
  version: new Set([]),
  video: new Set([]),
  "video generate": new Set(["aspect", "duration", "file", "first_frame", "first_frame_url", "fps", "generate_audio", "image", "image_url", "last_frame", "last_frame_url", "model", "no_wait", "prompt", "ratio", "resolution", "video_url"]),
  "video copy": new Set(["aspect", "depth_location", "depth_model", "depth_resolution", "duration", "fps", "frame_ratio", "generate_audio", "keep_depth", "model", "no_wait", "prompt", "ratio", "resolution", "source"]),
  "video status": new Set(["task_id"]),
  "video download": new Set(["task_id"]),
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
      options: { command: maybeAction, ...parseOptions(rest, repeatableOptionsFor("help")) },
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
  if (isVideoTaskCommand(group, action) && optionTokens[0] && !optionTokens[0].startsWith("-") && !isHelpToken(optionTokens[0])) {
    if (optionTokens.some((token) => token === "--task-id" || token.startsWith("--task-id="))) {
      throw new Error("Specify the video task ID once.");
    }
    optionTokens.unshift("--task-id");
  }
  const hasHelpOption = optionTokens.some((token) => token === "--help" || token === "-h")
    || (optionTokens.length === 1 && optionTokens[0] === "help");
  if (hasHelpOption) {
    return validateCommandOptions({
      group,
      action,
      options: {
        ...parseOptions(optionTokens.filter((token) => token !== "help" && token !== "--help" && token !== "-h"), repeatableOptionsFor(group, action)),
        help: true,
      },
    });
  }

  return validateCommandOptions({
    group,
    action,
    options: parseOptions(optionTokens, repeatableOptionsFor(group, action)),
  });
}

function isHelpToken(token) {
  return token === "help" || token === "--help" || token === "-h";
}

function isVideoTaskCommand(group, action) {
  return group === "video" && (action === "status" || action === "download");
}

function parseOptions(tokens, repeatableOptions = REPEATABLE_OPTIONS) {
  const options = {};
  const mediaInputs = [];
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
    const separator = token.indexOf("=");
    let name;
    let value;
    if (separator === -1) {
      name = token.slice(2).replaceAll("-", "_");
      const next = tokens[index + 1];
      const bareSwitch = BOOLEAN_OPTIONS.has(name) && next !== "true" && next !== "false";
      if (bareSwitch || !next || next.startsWith("--") || next === "-o" || next === "-h") {
        options[name] = true;
        continue;
      }
      value = next;
      index += 1;
    } else {
      name = token.slice(2, separator).replaceAll("-", "_");
      value = token.slice(separator + 1);
      if (!name) {
        throw new Error(`Unexpected argument: ${token}`);
      }
      if (!value) {
        throw new Error(`Missing value for --${name.replaceAll("_", "-")}.`);
      }
    }
    if (BOOLEAN_OPTIONS.has(name)) {
      if (value !== "true" && value !== "false") {
        throw new Error(`Invalid value for --${name.replaceAll("_", "-")}. Use true or false.`);
      }
      value = value === "true";
    }
    if (repeatableOptions.has(name)) {
      options[name] = [...asArray(options[name]), value];
    } else {
      options[name] = value;
    }
    if (MEDIA_INPUT_OPTIONS.has(name)) {
      mediaInputs.push({ name, value });
    }
  }
  if (mediaInputs.length > 0) {
    Object.defineProperty(options, "__media_inputs", {
      value: mediaInputs,
      enumerable: false,
      writable: true,
    });
  }
  return options;
}

function repeatableOptionsFor(group, action) {
  if (group === "image" && action === "generate") {
    return new Set([...REPEATABLE_OPTIONS, "file"]);
  }
  if (group === "video" && action === "generate") {
    return new Set([...REPEATABLE_OPTIONS, "file"]);
  }
  if (group === "video" && action === "copy") {
    return REPEATABLE_OPTIONS;
  }
  return REPEATABLE_OPTIONS;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function validateCommandOptions(command) {
  const key = command.action ? `${command.group} ${command.action}` : command.group;
  const allowed = COMMAND_OPTIONS[key] ?? new Set();
  for (const option of Object.keys(command.options)) {
    if (option.startsWith("_")) continue;
    if (GLOBAL_OPTIONS.has(option) || allowed.has(option)) continue;
    const flag = `--${option.replaceAll("_", "-")}`;
    const helpCommand = command.action
      ? `flatkey ${command.group} ${command.action} --help`
      : `flatkey ${command.group} --help`;
    throw new Error(`Unknown option ${flag} for flatkey ${key}. Run \`${helpCommand}\` to see supported options.`);
  }
  return command;
}

export async function main(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const command = parseArgv(argv);
  if (command.options.help) {
    const result = await runCommand(command, { ...deps, stdout, stderr });
    stdout.write(`${formatHuman(result)}\n`);
    return;
  }
  if (command.group === "onboard") {
    const { writeConfig } = await import("./config.js");
    const configPath = await writeConfig({ apiKey: command.options.api_key, configDir: deps.configDir });
    stdout.write(`Saved Flatkey config: ${configPath}\n`);
    await maybeWriteUpdateNotice(command, { ...deps, stderr });
    return;
  }

  const result = await runCommand(command, { ...deps, stdout, stderr });
  if (result !== undefined) {
    stdout.write(
      command.options.json ? `${JSON.stringify(result)}\n` : `${formatHuman(result)}\n`,
    );
  }
  await maybeWriteUpdateNotice(command, { ...deps, stderr });
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
    return handleModels(command, { ...deps, stdout, stderr });
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
    return handleUtility(command, { ...deps, stdout, stderr });
  }

  if (isVideoTaskCommand(command.group, command.action)) {
    return handleVideoTask(command, { ...deps, stderr });
  }

  if (["image", "video", "audio", "text"].includes(command.group)) {
    if (command.group === "audio" && command.action === "voices") {
      return handleVoices(command, { ...deps, stdout, stderr });
    }
    const validAction = command.group === "audio"
      ? ["generate", "sfx", "music"].includes(command.action)
      : command.group === "image"
        ? ["generate", "upload"].includes(command.action)
        : command.group === "video"
          ? ["generate", "copy"].includes(command.action)
          : command.action === "generate";
    if (!validAction) {
      throw new Error(`Unknown action for ${command.group}: ${command.action}`);
    }
    if (command.group === "image" && command.action === "upload") {
      return handleImageUpload(command, { ...deps, stdout, stderr });
    }
    return handleGenerate(command, { ...deps, stdout, stderr });
  }

  throw new Error(`Unknown command: ${command.group}`);
}

async function handleLogin(command, deps) {
  const { ensureDeviceId, readConfig, resolveOrigins, writeAuthConfig } = await import("./config.js");
  const { DEFAULT_CONSOLE_URL, createDeviceAuthorization, pollDeviceAuthorization } = await import("./api.js");
  const deviceId = await ensureDeviceId({ configDir: deps.configDir });
  const version = await readPackageVersion();
  const { consoleOrigin } = await resolveOrigins({
    consoleUrl: command.options.console_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const requestOptions = {
    consoleUrl: consoleOrigin ?? DEFAULT_CONSOLE_URL,
    fetch: deps.fetch,
    verbose: command.options.verbose,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  };
  const authorization = await createDeviceAuthorization({
    deviceId,
    clientName: "flatkey-cli",
    clientVersion: version,
    ...requestOptions,
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
      deviceCode: data.device_code,
      ...requestOptions,
    });
    const pollData = poll?.data ?? poll;
    if (pollData?.status === "approved") {
      const account = accountFromAuthData(pollData);
      if (!pollData.api_key) {
        const saved = await readConfig(deps.configDir);
        if (typeof saved?.apiKey === "string" && saved.apiKey.trim() !== "") {
          const configPath = await writeAuthConfig({
            apiKey: saved.apiKey,
            auth: {
              deviceId,
              userId: pollData.user_id ?? saved.auth?.userId,
              tokenId: pollData.token_id ?? saved.auth?.tokenId,
              account: account ?? saved.auth?.account,
              loginAt: Math.floor(Date.now() / 1000),
            },
            configDir: deps.configDir,
          });
          return command.options.json
            ? {
              success: true,
              configPath,
              account: stripDisplayOnlyIds(account ?? saved.auth?.account),
              reusedConfig: true,
            }
            : `Flatkey CLI already authorized. Saved config: ${configPath}`;
        }
        throw new Error("Flatkey login was approved, but no API key was returned. The authorization may have already been consumed. Run `flatkey login` again.");
      }
      const configPath = await writeAuthConfig({
        apiKey: pollData.api_key,
        auth: {
          deviceId,
          userId: pollData.user_id,
          tokenId: pollData.token_id,
          account,
          loginAt: Math.floor(Date.now() / 1000),
        },
        configDir: deps.configDir,
      });
      return command.options.json
        ? {
          success: true,
          configPath,
          account: stripDisplayOnlyIds(account),
        }
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
      : saved?.apiKey
        ? "config"
        : (deps.env ?? process.env).FLATKEY_API_KEY
          ? "env"
          : "none",
    key: maskKey(apiKey),
    auth: saved?.auth ?? null,
  };
  return command.options.json ? status : formatAuthStatus(status);
}

async function handleImageUpload(command, deps) {
  const { basename } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const { resolveApiKey, resolveOrigins } = await import("./config.js");
  const { DEFAULT_CONSOLE_URL, uploadTempMediaImage } = await import("./api.js");
  const file = command.options.file;
  if (typeof file !== "string" || file.trim() === "") {
    throw new Error("Missing --file value. Run `flatkey image upload --help` to see supported options.");
  }
  const media = mediaInfoFromPath(file);
  if (!media || media.kind !== "image") {
    throw new Error(`Unsupported image file type: ${file}`);
  }
  const { consoleOrigin } = await resolveOrigins({
    consoleUrl: command.options.console_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const baseUrl = consoleOrigin ?? DEFAULT_CONSOLE_URL;
  if (command.options.dry_run) {
    return {
      kind: "upload",
      dryRun: true,
      request: {
        method: "POST",
        url: `${baseUrl.replace(/\/$/, "")}/v1/temp-media/images`,
        body: { file, contentType: media.contentType },
      },
    };
  }
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const response = await uploadTempMediaImage({
    apiKey,
    baseUrl,
    file: await readFile(await expandHomePath(file)),
    filename: basename(file),
    contentType: media.contentType,
    fetch: deps.fetch,
    verbose: command.options.verbose,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  });
  const data = response?.data ?? response;
  const signedUrl = extractUploadedMediaUrl(response);
  if (!signedUrl) {
    throw new Error("Image upload failed: missing signed_url.");
  }
  return {
    kind: "upload",
    url: signedUrl,
    objectKey: data?.object_key,
    expiresAt: data?.expires_at,
    expiresIn: data?.expires_in,
    response,
  };
}

async function handleGenerate(command, deps) {
  const isVideoCopy = command.group === "video" && command.action === "copy";
  if (isVideoCopy && !command.options.source) {
    throw new Error("Missing --source value. Run `flatkey video copy --help` to see supported options.");
  }
  const { resolveApiKey, resolveOrigins } = await import("./config.js");
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
    uploadTempMediaImage,
    uploadTempMediaVideo,
  } = await import("./api.js");
  const { createAnimation } = await import("./animation.js");
  const apiKey = command.options.dry_run
    ? "FLATKEY_API_KEY"
    : await resolveApiKey({
        apiKey: command.options.api_key,
        env: deps.env ?? process.env,
        configDir: deps.configDir,
      });
  const { routerOrigin, consoleOrigin } = await resolveOrigins({
    baseUrl: command.options.base_url,
    consoleUrl: command.options.console_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const { consoleOrigin: tempMediaBaseUrl } = await resolveOrigins({
    consoleUrl: command.options.console_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const options = {
    ...command.options,
    apiKey,
    baseUrl: routerOrigin ?? DEFAULT_BASE_URL,
    tempMediaBaseUrl: tempMediaBaseUrl ?? DEFAULT_CONSOLE_URL,
    env: deps.env ?? process.env,
    fetch: deps.fetch,
    sleep: deps.sleep,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  };
  if (Array.isArray(command.options.__media_inputs)) {
    options.__media_inputs = command.options.__media_inputs;
  }
  const mediaDefaults = PREFERRED_MEDIA_MODELS[command.group];
  if (mediaDefaults) {
    const plan = command.group === "image" ? planImageRequest : planVideoRequest;
    const planOptions = isVideoCopy ? {
      ...options,
      __media_inputs: [{ kind: "video", role: "reference_video", url: "<generated>/depth.mp4" }],
    } : options;
    options.model = await resolveMediaModel(command.group, planOptions, consoleOrigin, plan);
  }
  let videoCopy;
  if (isVideoCopy) {
    const { prepareVideoCopy, validateCopyDuration, parseDepthResolution, parseFrameRatio } = await import("./video-copy.js");
    if (command.options.dry_run) {
      parseDepthResolution(options.depth_resolution);
      parseFrameRatio(options.frame_ratio);
      videoCopy = {
        source: options.source,
        depthPath: "<generated>/depth.mp4",
        duration: options.duration === undefined ? undefined : validateCopyDuration(options.duration, "--duration"),
      };
    } else {
      videoCopy = await (deps.prepareVideoCopy ?? prepareVideoCopy)(command.options, deps);
    }
    options.prompt ??= "Recreate the reference video as faithfully as possible while following the supplied depth motion.";
    options.duration = videoCopy.duration;
    options.__media_inputs = [{
      name: "depth_video",
      value: videoCopy.depthPath,
      kind: "local",
      optionName: "file",
      role: "reference_video",
    }];
    options.__copy_reference_mode = "depth-video";
  }
  if (command.group === "image" || command.group === "video") {
    try {
      await prepareMediaInputs(command, options, {
        apiKey,
        baseUrl: options.baseUrl,
        tempMediaBaseUrl: tempMediaBaseUrl ?? DEFAULT_CONSOLE_URL,
        fetch: deps.fetch,
        verbose: command.options.verbose,
        verboseLog: verboseLogger(deps.stderr, command.options.verbose),
        uploadTempMediaImage,
        uploadTempMediaVideo,
      });
    } catch (error) {
      await videoCopy?.cleanup?.();
      throw error;
    }
  }
  if (command.group === "video" && command.action === "copy"
    && !options.__media_inputs?.some((entry) => entry.kind === "video")) {
    throw new Error("Video copy failed to prepare its depth-video reference.");
  }
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
    if (videoCopy && videoCopy.duration === undefined) request.body.duration = "<source duration>";
    return {
      dryRun: true,
      kind: command.group,
      request: redactRequest(request),
      ...(mediaDefaults && !command.options.model ? { previewModel: options.model } : {}),
      videoCopy: scrubVideoCopy(videoCopy),
      copyReferenceMode: options.__copy_reference_mode,
    };
  }
  const animation = createAnimation({
    json: Boolean(command.options.json),
    stream: deps.stderr,
  });
  animation.start(command.group);
  let taskId;
  try {
    let response;
    try {
      response = command.group === "image"
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
    } catch (error) {
      if (error.taskId || !videoCopy || options.__copy_reference_mode !== "depth-video" || !isDepthVideoFetchFailure(error)) {
        throw error;
      }
      options.__media_inputs = (videoCopy.referencePaths ?? []).map((value, index) => ({
        name: `depth_frame_${String(index + 1).padStart(2, "0")}`,
        value,
        kind: "local",
        optionName: "image",
        role: index === 0
          ? "first_frame"
          : index === (videoCopy.referencePaths.length - 1)
            ? "last_frame"
            : "reference_image",
      }));
      await prepareMediaInputs(command, options, {
        apiKey,
        baseUrl: options.baseUrl,
        tempMediaBaseUrl: tempMediaBaseUrl ?? DEFAULT_CONSOLE_URL,
        fetch: deps.fetch,
        verbose: command.options.verbose,
        verboseLog: verboseLogger(deps.stderr, command.options.verbose),
        uploadTempMediaImage,
        uploadTempMediaVideo,
      });
      options.__copy_reference_mode = "depth-keyframes-fallback";
      response = await generateVideo(options);
    }
    if (command.group === "video") {
      taskId = videoTaskId(response);
      const task = videoTaskPayload(response);
      const completed = completedVideoResult(response, options, taskId);
      if (!completed && options.no_wait && taskId) return videoSubmissionReceipt(task, options, taskId);
      response = completed ?? await waitForVideoResult(task, options, taskId);
    }
    const artifactResponse = response;
    if (command.group === "text") {
      const text = extractText(response);
      const output = await writeTextOutput(text, command.options.output);
      return { kind: command.group, text, output, response };
    }
    const outDir = command.options.out ?? "flatkey-output";
    const format = command.group === "image" ? command.options.output_format : undefined;
    const artifacts = await persistArtifacts({
      kind: command.group,
      response: artifactResponse,
      outDir,
      output: command.options.output,
      downloadRemote: command.group === "video",
      format,
      fetch: command.group === "video" ? videoArtifactFetch(options, taskId) : (url, init) => fetchWithRetry(options, url, init),
    });
    return {
      kind: command.group,
      ...(taskId ? { taskId } : {}),
      ...(mediaDefaults ? { model: options.model } : {}),
      artifacts,
      response: scrubArtifactResponse(artifactResponse),
      ...(videoCopy ? { copyReferenceMode: options.__copy_reference_mode } : {}),
    };
  } catch (error) {
    if (!error.taskId && command.group === "video"
      && (taskId || silentVideoHint(options, undefined, error.message, error.code))) {
      throw videoTaskError(options, taskId, error.message, { cause: error });
    }
    throw error;
  } finally {
    animation.stop();
    await videoCopy?.cleanup?.();
  }
}

async function resolveMediaModel(kind, options, consoleOrigin, plan) {
  if (options.model !== undefined) {
    if (typeof options.model !== "string" || !options.model.trim()) throw new Error("Missing value for --model.");
    plan(options);
    return options.model;
  }
  const catalog = options.dry_run
    ? { data: PREFERRED_MEDIA_MODELS[kind].map((id) => ({ id, type: kind })) }
    : await getModels({ ...options, baseUrl: consoleOrigin ?? DEFAULT_CONSOLE_URL });
  let lastReason;
  for (const model of mediaModelCandidates(catalog, kind, options)) {
    try {
      plan({ ...options, model });
      return model;
    } catch (error) {
      lastReason = error.message;
    }
  }
  throw new FlatkeyError(
    `No available ${kind} model for this request.${lastReason ? ` ${lastReason}` : ""} Run flatkey models --type ${kind} or specify --model.`,
    { code: "no_available_model" },
  );
}

async function prepareMediaInputs(command, options, deps) {
  const mediaInputs = orderedMediaInputs(command, options).map((input) => describeMediaInput(input, command.group));
  if (mediaInputs.length === 0) return;
  assertMediaReferenceLimit(mediaInputs, command.group, options.model);

  const resolved = [];
  for (const { local, ...input } of mediaInputs) {
    if (command.options.dry_run) {
      if (local) input.value = `<upload: ${input.value}>`;
      input.mime ??= "<MIME determined on submission>";
    } else if (local) {
      input.value = await uploadLocalMedia(input, deps);
    } else {
      const media = await confirmRemoteMediaUrl(input.value, command.group, deps, input.name);
      input.mime = media.contentType;
    }
    resolved.push(input);
  }
  options.__media_inputs = resolved;
}

function describeMediaInput(input, commandGroup) {
  const name = input.optionName ?? input.name;
  const local = input.kind === "local";
  const media = mediaInfoFromPath(local ? input.value : String(input.value).split(/[?#]/, 1)[0]);
  if (local && (!media || !allowedMediaKindsForOption(commandGroup, name).has(media.kind))) {
    throw new Error(`Unsupported --${name.replaceAll("_", "-")} file type for flatkey ${commandGroup} generate: ${input.value}`);
  }
  const kind = local ? media.kind : name === "video_url" ? "video" : "image";
  return {
    name,
    value: input.value,
    kind,
    role: input.role ?? mediaRoleFromOption(name, kind),
    mime: media?.kind === kind ? media.contentType : undefined,
    local,
  };
}

function assertMediaReferenceLimit(mediaInputs, commandGroup, model) {
  const imageInputs = mediaInputs.filter((entry) => entry.kind !== "video");
  const videoInputs = mediaInputs.filter((entry) => entry.kind === "video");
  if (isSeedance25Model(model)) {
    if (imageInputs.length > 30) {
      throw new Error(`Too many reference images for flatkey ${commandGroup} generate with Seedance 2.5: maximum 30.`);
    }
    if (videoInputs.length > 10) {
      throw new Error(`Too many reference videos for flatkey ${commandGroup} generate with Seedance 2.5: maximum 10.`);
    }
    return;
  }
  if (imageInputs.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`Too many reference images for flatkey ${commandGroup} generate: maximum ${MAX_REFERENCE_IMAGES}.`);
  }
}

function isSeedance25Model(model) {
  return String(model ?? "").toLowerCase().replaceAll(/[-_.]/g, "").includes("seedance25");
}

function orderedMediaInputs(command, options) {
  const mediaInputs = Array.isArray(options.__media_inputs) ? options.__media_inputs : [];
  if (mediaInputs.length > 0 && mediaInputs[0] && Object.prototype.hasOwnProperty.call(mediaInputs[0], "kind")) {
    return mediaInputs;
  }
  if (mediaInputs.length > 0) {
    return mediaInputs.map((entry) => ({
      name: entry.name,
      value: entry.value,
      kind: entry.name.endsWith("_url") ? "url" : "local",
    }));
  }

  const legacyInputs = [];
  const pushLocal = (name, value) => {
    for (const file of asArray(value)) {
      legacyInputs.push({ name, value: file, kind: "local" });
    }
  };
  const pushUrl = (name, value) => {
    for (const url of asArray(value)) {
      legacyInputs.push({ name, value: url, kind: "url" });
    }
  };

  pushLocal("file", options.file);
  pushLocal("image", options.image);
  pushUrl("image_url", options.image_url);
  if (command.group === "video") {
    pushUrl("video_url", options.video_url);
    pushLocal("first_frame", options.first_frame);
    pushUrl("first_frame_url", options.first_frame_url);
    pushLocal("last_frame", options.last_frame);
    pushUrl("last_frame_url", options.last_frame_url);
  }
  return legacyInputs;
}

async function uploadLocalMedia(input, deps) {
  const { basename } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const uploader = input.kind === "video" ? deps.uploadTempMediaVideo : deps.uploadTempMediaImage;
  const response = await uploader({
    apiKey: deps.apiKey,
    baseUrl: deps.tempMediaBaseUrl ?? deps.baseUrl,
    file: await readFile(await expandHomePath(input.value)),
    filename: basename(input.value),
    contentType: input.mime,
    fetch: deps.fetch,
    verbose: deps.verbose,
    verboseLog: deps.verboseLog,
  });
  const url = extractUploadedMediaUrl(response);
  if (!url) throw new Error(`Media upload failed: missing signed_url for ${input.value}`);
  return url;
}

async function confirmRemoteMediaUrl(url, commandGroup, deps, optionName) {
  const fetchImpl = deps.fetch ?? fetch;
  const allowedKinds = allowedMediaKindsForOption(commandGroup, optionName);
  let head;
  try {
    head = await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(REMOTE_MEDIA_PROBE_TIMEOUT_MS) });
  } catch {
    // Object stores can sign the URL specifically for GET.
  }
  const declared = mediaInfoFromMime(headerValue(head?.headers, "content-type"));
  if (isOkResponse(head) && declared && allowedKinds.has(declared.kind)) return declared;

  const flag = `--${optionName.replaceAll("_", "-")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_MEDIA_PROBE_TIMEOUT_MS);
  try {
    const response = await fetchWithRetry(deps, url, {
      method: "GET",
      headers: { Range: `bytes=0-${REMOTE_MEDIA_PROBE_BYTES - 1}` },
      signal: controller.signal,
    });
    const contentType = headerValue(response.headers, "content-type");
    if (!isOkResponse(response)) {
      throw responseError(response, undefined, {
        message: `Could not fetch ${flag}: HTTP ${response.status}${contentType ? ` (${contentType})` : ""}`,
        code: "media_fetch_failed",
      });
    }
    const prefix = await readLeadingBytes(response);
    const media = prefix === undefined ? mediaInfoFromMime(contentType) : mediaInfoFromBytes(prefix);
    if (media && allowedKinds.has(media.kind)) return media;
    throw new FlatkeyError(`Unsupported ${flag} MIME type for flatkey ${commandGroup} generate: ${contentType ?? "unknown"}`, {
      code: "unsupported_media_type",
    });
  } catch (error) {
    if (error instanceof FlatkeyError) throw error;
    throw new FlatkeyError(`Could not fetch ${flag}: ${error.message}`, { code: "media_fetch_failed" });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const REMOTE_MEDIA_PROBE_BYTES = 64 * 1024;
const REMOTE_MEDIA_PROBE_TIMEOUT_MS = 15_000;

function isOkResponse(response) {
  return response?.ok ?? (response?.status >= 200 && response?.status < 300);
}

async function readLeadingBytes(response) {
  if (response.body === null) return Buffer.alloc(0);
  const reader = response.body?.getReader?.();
  if (!reader) return undefined;
  const prefix = Buffer.alloc(REMOTE_MEDIA_PROBE_BYTES);
  let length = 0;
  try {
    while (length < prefix.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, prefix.length - length);
      prefix.set(chunk, length);
      length += chunk.length;
    }
    return prefix.subarray(0, length);
  } finally {
    // An origin can ignore Range and send the full video.
    reader.cancel().catch(() => {});
  }
}

function mediaInfoFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return undefined;
  const ascii = (start, end) => bytes.subarray(start, end).toString("latin1");
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { kind: "image", contentType: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { kind: "image", contentType: "image/jpeg" };
  if (ascii(0, 4) === "RIFF" && bytes.length >= 12 && ascii(8, 12) === "WEBP") return { kind: "image", contentType: "image/webp" };
  if (ascii(0, 4) === "GIF8") return { kind: "image", contentType: "image/gif" };
  if (ascii(0, 2) === "BM" && bytes.length >= 18 && [12, 40, 52, 56, 64, 108, 124].includes(bytes.readUInt32LE(14))) {
    return { kind: "image", contentType: "image/bmp" };
  }
  if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") return { kind: "image", contentType: "image/tiff" };
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return { kind: "image", contentType: "image/heic" };
    if (["mif1", "msf1"].includes(brand)) return { kind: "image", contentType: "image/heif" };
    if (brand === "qt  ") return { kind: "video", contentType: "video/quicktime" };
    if (["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V "].includes(brand)) {
      return { kind: "video", contentType: "video/mp4" };
    }
  }
  return undefined;
}

function extractUploadedMediaUrl(response) {
  const data = response?.data ?? response;
  return data?.signed_url ?? data?.signedUrl ?? data?.url ?? response?.signed_url ?? response?.signedUrl ?? response?.url;
}

function mediaInfoFromPath(file) {
  const lower = String(file).toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { kind: "image", contentType: "image/jpeg" };
  if (lower.endsWith(".png")) return { kind: "image", contentType: "image/png" };
  if (lower.endsWith(".webp")) return { kind: "image", contentType: "image/webp" };
  if (lower.endsWith(".mp4")) return { kind: "video", contentType: "video/mp4" };
  if (lower.endsWith(".mov")) return { kind: "video", contentType: "video/quicktime" };
  if (lower.endsWith(".bmp")) return { kind: "image", contentType: "image/bmp" };
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return { kind: "image", contentType: "image/tiff" };
  if (lower.endsWith(".gif")) return { kind: "image", contentType: "image/gif" };
  if (lower.endsWith(".heic")) return { kind: "image", contentType: "image/heic" };
  if (lower.endsWith(".heif")) return { kind: "image", contentType: "image/heif" };
  return undefined;
}

const SUPPORTED_MEDIA_TYPES = new Set([
  "image/bmp", "image/gif", "image/heic", "image/heif", "image/jpeg", "image/png", "image/tiff", "image/webp",
  "video/mp4", "video/quicktime",
]);

function mediaInfoFromMime(contentType) {
  if (typeof contentType !== "string") return undefined;
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  if (!SUPPORTED_MEDIA_TYPES.has(type)) return undefined;
  return { kind: type.startsWith("video/") ? "video" : "image", contentType: type };
}

function mediaRoleFromOption(optionName, kind) {
  if (optionName === "first_frame" || optionName === "first_frame_url") return "first_frame";
  if (optionName === "last_frame" || optionName === "last_frame_url") return "last_frame";
  if (kind === "video") return "reference_video";
  return "reference_image";
}

function allowedMediaKindsForOption(commandGroup, optionName) {
  if (commandGroup === "image") return new Set(["image"]);
  if (optionName === "file") return new Set(["image", "video"]);
  if (optionName === "video_url") return new Set(["video"]);
  if (optionName === "first_frame" || optionName === "first_frame_url" || optionName === "last_frame" || optionName === "last_frame_url" || optionName === "image" || optionName === "image_url") {
    return new Set(["image"]);
  }
  return new Set(["image"]);
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") {
    return headers.get(name) ?? headers.get(name.toLowerCase());
  }
  return headers[name] ?? headers[name.toLowerCase()];
}

async function handleVideoTask(command, deps) {
  const taskId = command.options.task_id;
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new Error(`Missing video task ID. Run \`flatkey video ${command.action} --task-id <id>\`.`);
  }
  const { resolveApiKey, resolveOrigins } = await import("./config.js");
  const config = { env: deps.env ?? process.env, configDir: deps.configDir };
  const { routerOrigin } = await resolveOrigins({ ...config, baseUrl: command.options.base_url });
  const options = {
    ...command.options,
    baseUrl: routerOrigin ?? DEFAULT_BASE_URL,
    fetch: deps.fetch,
    sleep: deps.sleep,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  };
  if (command.options.dry_run) {
    const plan = command.action === "status" ? planVideoStatusRequest : planVideoContentRequest;
    return { dryRun: true, kind: `video ${command.action}`, request: redactRequest(plan(options, taskId)) };
  }
  options.apiKey = await resolveApiKey({ ...config, apiKey: command.options.api_key });
  const response = await readVideoStatus(options, taskId);
  const task = videoTaskPayload(response);
  const status = task?.status ?? (isVideoFailed(task) ? "failed" : hasArtifact(task) ? "completed" : "unknown");
  if (command.action === "status") {
    const hint = isVideoFailed(task) ? silentVideoHint(options, task, videoFailureReason(task), task?.error?.code) : undefined;
    const requestId = getResponseMetadata(response)?.requestId ?? task?.request_id ?? task?.error?.request_id;
    return { ...scrubArtifactResponse(task), taskId, status, ...(requestId ? { requestId } : {}), ...(hint ? { hint } : {}) };
  }
  if (!completedVideoResult(response, options, taskId)) {
    throw videoTaskError(options, taskId, `Video is not ready to download (status: ${status}).`, {
      code: "video_not_ready", taskStatus: status,
    });
  }
  try {
    const artifacts = await persistArtifacts({
      kind: "video", outDir: command.options.out, output: command.options.output, downloadRemote: true,
      response: { url: planVideoContentRequest(options, taskId).url },
      fetch: videoArtifactFetch(options, taskId),
    });
    return { taskId, status, artifacts };
  } catch (cause) {
    throw videoTaskError(options, taskId, cause.message, { cause, taskStatus: status });
  }
}

function videoArtifactFetch(options, taskId) {
  const contentUrl = taskId ? planVideoContentRequest(options, taskId).url : undefined;
  return (url, init) => url === contentUrl
    ? fetchVideoContent(options, taskId)
    : fetchWithRetry(options, url, init);
}

function videoTaskArgs(action, taskId, options) {
  const args = ["video", action, "--task-id", taskId];
  const router = options.base_url ?? (options.baseUrl !== DEFAULT_BASE_URL ? options.baseUrl : undefined);
  if (router) args.push("--base-url", router);
  if (action === "download") {
    if (options.output) args.push("--output", options.output);
    else if (options.out) args.push("--out", options.out);
  }
  return args;
}

function videoTaskError(options, taskId, message, { cause, code, taskStatus, response } = {}) {
  const action = isVideoDone({ status: taskStatus }) ? "download" : "status";
  const hint = taskId ? ` Run \`${formatVideoTaskCommand(videoTaskArgs(action, taskId, options))}\` to access this task.` : "";
  const task = videoTaskPayload(response);
  const audioHint = silentVideoHint(options, task, message, code ?? cause?.code);
  const http = getResponseMetadata(response);
  return new FlatkeyError(`${message}${audioHint ? ` ${audioHint}` : ""}${hint}`, {
    taskId, taskStatus, cause, code: code ?? cause?.code,
    status: cause?.status ?? http?.status,
    requestId: cause?.requestId ?? http?.requestId ?? task?.request_id ?? task?.error?.request_id,
    retryAfterMs: cause?.retryAfterMs,
  });
}

async function readVideoStatus(options, taskId) {
  try {
    return await getVideo(options, taskId);
  } catch (cause) {
    throw videoTaskError(options, taskId, cause.message, { cause });
  }
}

function videoTaskPayload(response) {
  return response?.data && typeof response.data === "object" && !Array.isArray(response.data)
    && !response.status && !response.error ? response.data : response;
}

function videoSubmissionReceipt(task, options, taskId) {
  return {
    kind: "video", taskId, status: task.status ?? "submitted", model: options.model,
    downloadArgs: videoTaskArgs("download", taskId, options),
    ...(options.__copy_reference_mode ? { copyReferenceMode: options.__copy_reference_mode } : {}),
  };
}

async function waitForVideoResult(response, options, taskId) {
  if (!taskId) throw new Error("Video response contained neither a result nor a task ID.");
  const timeoutMs = parsePositiveInteger(
    options.video_wait_timeout_ms ?? options.env?.FLATKEY_VIDEO_WAIT_TIMEOUT_MS,
    600_000,
  );
  const intervalMs = parsePositiveInteger(
    options.video_poll_interval_ms ?? options.env?.FLATKEY_VIDEO_POLL_INTERVAL_MS,
    5_000,
  );
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const polling = { ...options, signal: controller.signal };
  let last = response;
  try {
    while (Date.now() < deadline && !controller.signal.aborted) {
      const statusResponse = await readVideoStatus(polling, taskId);
      last = videoTaskPayload(statusResponse);
      if (controller.signal.aborted || Date.now() >= deadline) break;
      const result = completedVideoResult(statusResponse, options, taskId);
      if (result) return result;
      await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())), { sleep: options.sleep });
    }
  } catch (error) {
    const remaining = deadline - Date.now();
    if (!controller.signal.aborted && remaining > 0) {
      if ((error.status === 429 || error.status === 503) && error.retryAfterMs > remaining) {
        throw videoTaskError(options, taskId, "The next status retry falls outside the video wait deadline.", {
          cause: error, code: "video_wait_timeout", taskStatus: last?.status,
        });
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }

  const elapsed = timeoutMs < 1000 ? `${timeoutMs}ms` : `${timeoutMs / 1000}s`;
  throw videoTaskError(options, taskId, `Timed out waiting ${elapsed} for video task ${taskId}.`, {
    code: "video_wait_timeout", taskStatus: last?.status,
  });
}

function videoFailureReason(task) {
  return firstNonEmpty(task?.error?.message, task?.error, task?.fail_reason, task?.failure_reason, task?.message);
}

function silentVideoHint(options, task, reason, code) {
  const audio = options.generate_audio ?? task?.generate_audio;
  if (!/seedance/i.test(task?.model ?? options.model ?? "") || audio === false || audio === "false") return;
  const details = `${code ?? ""} ${reason ?? ""}`;
  if (/(?:output|generated)[\s_-]*(?:audio|soundtrack)|(?:输出|生成)的?音[轨频]/i.test(details)
    && /copyright|版权|著作权/i.test(details)) {
    return "For a silent video, start a new task with --generate-audio false.";
  }
}

function completedVideoResult(raw, options, taskId) {
  const response = videoTaskPayload(raw);
  if (isVideoFailed(response)) {
    const status = response?.status ?? "failed";
    const reason = videoFailureReason(response);
    throw videoTaskError(options, taskId, `Video task ${status}${reason ? `: ${reason}` : "."}`, {
      code: response?.error?.code ?? response?.code ?? "video_task_failed", taskStatus: status, response: raw,
    });
  }
  if (response?.status && !isVideoDone(response)) return undefined;
  if (hasArtifact(response)) return response;
  if (!isVideoDone(response) || !taskId) return undefined;
  const url = planVideoContentRequest(options, taskId).url;
  return {
    ...response,
    metadata: { ...response.metadata, url },
    data: [{ url }],
  };
}

function hasArtifact(response) {
  return Boolean(
    response?.metadata?.url
      || response?.metadata?.temp_url
      || response?.url
      || response?.temp_url
      || response?.video_url?.url
      || response?.video?.url
      || response?.video?.temp_url
      || response?.data?.some?.((item) => item?.url || item?.temp_url || item?.b64_json || item?.base64 || item?.data)
      || response?.artifacts?.some?.((item) => item?.url || item?.temp_url || item?.path)
      || response?.content?.some?.((item) => item?.url || item?.video_url?.url || item?.data_url || item?.b64_json || item?.base64 || item?.data),
  );
}

function videoTaskId(response) {
  return firstNonEmpty(response?.id, response?.task_id, response?.taskId, response?.data?.id, response?.data?.task_id);
}

function isVideoDone(response) {
  return ["completed", "done", "succeeded", "success"].includes(String(response?.status ?? "").toLowerCase());
}

function isVideoFailed(response) {
  return ["failed", "failure", "cancelled", "canceled"].includes(String(response?.status ?? "").toLowerCase())
    || Boolean(response?.error);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function scrubVideoCopy(value) {
  if (!value) return undefined;
  return {
    source: value.source,
    depthPath: value.depthPath,
    referencePaths: value.referencePaths,
    duration: value.duration,
    sourceInfo: value.sourceInfo,
    helper: value.helper,
  };
}

function isDepthVideoFetchFailure(error) {
  if (error?.status !== 400 && error?.status !== 422) return false;
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? error).toLowerCase();
  return code.includes("fail_to_fetch")
    || code.includes("video_fetch")
    || message.includes("fail_to_fetch")
    || message.includes("failed to fetch")
    || message.includes("unable to fetch")
    || message.includes("video reference");
}

async function handleVoices(command, deps) {
  const { resolveApiKey, resolveOrigins } = await import("./config.js");
  const { getVoices } = await import("./api.js");
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const { routerOrigin } = await resolveOrigins({
    baseUrl: command.options.base_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  return getVoices({
    apiKey,
    baseUrl: routerOrigin,
    fetch: deps.fetch,
    verbose: command.options.verbose,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
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
  const { readConfig, resolveApiKey, resolveOrigins } = await import("./config.js");
  const saved = await readConfig(deps.configDir);
  const { getCredits, getStatus } = await import("./api.js");
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const { consoleOrigin } = await resolveOrigins({
    baseUrl: command.options.base_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const options = {
    apiKey,
    baseUrl: consoleOrigin,
    fetch: deps.fetch,
    verbose: command.options.verbose,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  };
  if (command.group === "credits") return getCredits(options);

  const status = sanitizeStatusResponse(await getStatus(options));
  const account = effectiveAccountForStatus({ command, saved, apiKey });
  if (!account || !status || typeof status !== "object" || Array.isArray(status) || status.account !== undefined) {
    return command.options.json ? status : extractStatusDisplayFields(status);
  }
  const mergedStatus = sanitizeStatusResponse({ ...status, account });
  return command.options.json ? mergedStatus : extractStatusDisplayFields(mergedStatus);
}

function effectiveAccountForStatus({ command, saved, apiKey }) {
  if (command.options.api_key || !saved?.apiKey || saved.apiKey !== apiKey) return null;
  if (saved.auth?.account !== undefined) return saved.auth.account;
  return accountFromAuthData(saved.auth);
}

function accountFromAuthData(data) {
  if (!data || typeof data !== "object") return null;
  const email = data.account?.email ?? data.email ?? data.userEmail ?? data.user_email;
  const name = data.account?.name ?? data.name;
  const userId = data.account?.userId ?? data.account?.user_id ?? data.userId ?? data.user_id;
  if (email === undefined && name === undefined && userId === undefined) return null;
  return Object.fromEntries(
    Object.entries({
      email,
      name,
      userId,
    }).filter(([, value]) => value !== undefined && value !== null),
  );
}

function sanitizeStatusResponse(status) {
  if (!status || typeof status !== "object") return status;
  if (Array.isArray(status)) {
    return status.map((entry) => sanitizeStatusResponse(entry));
  }
  return Object.fromEntries(
    Object.entries(status)
      .filter(([key]) => !["userId", "user_id"].includes(key))
      .map(([key, value]) => [key, sanitizeStatusResponse(value)]),
  );
}

function stripDisplayOnlyIds(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((entry) => stripDisplayOnlyIds(entry));
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["userId", "user_id", "tokenId", "token_id"].includes(key))
      .map(([key, nested]) => [key, stripDisplayOnlyIds(nested)]),
  );
}

function extractStatusDisplayFields(status) {
  if (!status || typeof status !== "object") return status;
  const email = status.email ?? status.account?.email ?? status.user?.email;
  const name = status.name ?? status.account?.name ?? status.user?.name;
  const result = {};
  if (email !== undefined) result.email = email;
  if (name !== undefined) result.name = name;
  return result;
}

async function handleModels(command, deps) {
  const { resolveApiKey, resolveOrigins } = await import("./config.js");
  const { getPublicModelPricing } = await import("./api.js");
  const { normalizeModels } = await import("./models.js");

  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const { consoleOrigin } = await resolveOrigins({
    baseUrl: command.options.base_url,
    consoleUrl: command.options.console_url,
    env: deps.env ?? process.env,
    configDir: deps.configDir,
  });
  const options = {
    apiKey,
    baseUrl: consoleOrigin,
    fetch: deps.fetch,
    sleep: deps.sleep,
    verbose: command.options.verbose,
    verboseLog: verboseLogger(deps.stderr, command.options.verbose),
  };
  const models = normalizeModels(await getModels(options), command.options.type);
  if (!command.options.pricing) return { models };
  const prices = (await getPublicModelPricing(options)).display_pricing ?? {};
  return {
    pricingGroup: "plg",
    models: models.map((model) => ({
      ...model, pricing: Object.hasOwn(prices, model.id) ? prices[model.id] : null,
    })),
  };
}

function verboseLogger(stream, enabled) {
  if (!enabled) return () => {};
  return (line) => {
    if (typeof line === "string") {
      stream?.write?.(`${line}\n`);
    }
  };
}

function formatHuman(result) {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return String(result);
  if (result.dryRun && result.request) return formatDryRun(result);
  if (result.taskId && !result.kind && Array.isArray(result.artifacts)) {
    return [`Video task: ${result.taskId}`, ...result.artifacts.map((artifact) => `Saved: ${artifact.path}`)].join("\n");
  }
  if (result.kind === "upload") return formatUploadResult(result);
  if (result.kind) return formatGenerationResult(result);
  if (Array.isArray(result.models)) return formatModels(result.models, result.pricingGroup);
  if (Array.isArray(result.voices)) return formatVoices(result.voices);
  if (typeof result.authenticated === "boolean") return formatAuthStatus(result);
  return formatKeyValues(result);
}

function formatDryRun(result) {
  const lines = [
    `Dry run: ${result.kind}`,
    `${result.request.method ?? "GET"} ${result.request.url}`,
  ];
  if (result.previewModel) {
    lines.push(`Preview model: ${result.previewModel}. A live request selects from your account's model list.`);
  }
  if (result.request.body !== undefined) {
    lines.push("Body:");
    lines.push(JSON.stringify(result.request.body, null, 2));
  }
  return lines.join("\n");
}

function formatUploadResult(result) {
  const lines = ["Image uploaded:"];
  if (result.url) lines.push(`URL: ${result.url}`);
  if (result.expiresIn) lines.push(`Expires in: ${result.expiresIn}s`);
  return lines.join("\n");
}

function formatVideoTaskCommand(args) {
  const quoted = args.map((arg) => {
    if (/^[\w./:@+,=~-]+$/.test(arg)) return arg;
    const value = process.platform === "win32" ? arg.replaceAll("'", "''") : arg.replaceAll("'", "'\\''");
    return `'${value}'`;
  });
  return `flatkey ${quoted.join(" ")}`;
}

function formatGenerationResult(result) {
  if (result.downloadArgs) {
    return [
      `Video task ${result.taskId} (${result.status}).`,
      `Download when ready: ${formatVideoTaskCommand(result.downloadArgs)}`,
    ].join("\n");
  }
  if (result.kind === "text") {
    const lines = [result.text || "(empty text)"];
    if (result.output) lines.push(`Saved: ${result.output}`);
    return lines.join("\n");
  }
  const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
  if (artifacts.length === 0) return `${titleCase(result.kind)} generated. No artifacts returned.`;
  const lines = [`${titleCase(result.kind)} generated:`];
  for (const artifact of artifacts) {
    if (artifact.path) lines.push(`- Saved: ${artifact.path}`);
    else if (artifact.url) lines.push(`- URL: ${artifact.url}`);
    else lines.push(`- ${JSON.stringify(artifact)}`);
  }
  return lines.join("\n");
}

function formatModels(models, pricingGroup) {
  if (models.length === 0) return "No models available.";
  return [
    `Available models (${models.length}):`,
    formatTable(
      ["Model", "Type", "Source", "Image CLI", ...(pricingGroup ? ["Public PLG rate (USD)"] : [])],
      models.map((model) => [
        model.id,
        model.type ?? "",
        model.source ?? "",
        model.type === "image" ? (model.cliSupported ? "supported" : "unsupported") : "",
        ...(pricingGroup ? [formatPublicRate(model.pricing)] : []),
      ]),
    ),
  ].join("\n");
}

function formatPublicRate(pricing) {
  if (!pricing?.prices) return "Not listed";
  const { request, second, input, output, image } = pricing.prices;
  const rate = (pair) => `${pair.from ? "from " : ""}$${pair.plg}`;
  if (request?.plg != null) return `${rate(request)}/request`;
  if (second?.plg != null) return `${rate(second)}/s`;
  const tokenRates = Object.entries({ input, output, image })
    .filter(([, pair]) => pair?.plg != null)
    .map(([key, pair]) => `${rate(pair)}/1M ${key} tokens`);
  return tokenRates.join(", ") || pricing.billing_kind || "Not listed";
}

function formatVoices(voices) {
  if (voices.length === 0) return "No voices available.";
  const lines = [`Available voices (${voices.length}):`];
  for (const voice of voices) {
    const id = voice.voice_id ?? voice.id;
    const name = voice.name ? `${voice.name} ` : "";
    lines.push(`- ${name}${id ? `(${id})` : ""}`.trim());
  }
  return lines.join("\n");
}

function formatKeyValues(result) {
  const entries = Object.entries(result);
  if (entries.length === 0) return "OK";
  const lines = entries
    .map(([key, value]) => `${humanLabel(key)}: ${formatScalar(value)}`)
  const warning = lowCreditWarning(result);
  if (warning) lines.push(warning);
  return lines.join("\n");
}

function lowCreditWarning(result) {
  const credits = extractCreditAmount(result);
  if (credits === undefined || credits >= 10) return "";
  return `Low credit warning: remaining credits are ${credits}. Top up soon.`;
}

function extractCreditAmount(result) {
  const creditKeys = new Set([
    "credit",
    "credits",
    "remaining",
    "balance",
    "total_available",
    "totalAvailable",
    "available_balance",
    "availableBalance",
  ]);
  const stack = [result];
  const seen = new Set();
  while (stack.length > 0) {
    const value = stack.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (creditKeys.has(key)) {
        const number = Number(entry);
        if (Number.isFinite(number)) return number;
      }
      if (entry && typeof entry === "object") stack.push(entry);
    }
  }
  return undefined;
}

function formatScalar(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanLabel(key) {
  return key
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function titleCase(value) {
  return String(value).replace(/^./, (char) => char.toUpperCase());
}

function formatTable(headers, rows) {
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map((row) => String(row[index] ?? "").length),
  ));
  const line = (cells) => cells
    .map((cell, index) => String(cell ?? "").padEnd(widths[index]))
    .join("  ")
    .trimEnd();
  return [
    line(headers),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map(line),
  ].join("\n");
}

async function readPackageVersion() {
  const { readFile } = await import("node:fs/promises");
  const packageUrl = new URL("../package.json", import.meta.url);
  return JSON.parse(await readFile(packageUrl, "utf8")).version;
}

async function maybeWriteUpdateNotice(command, deps = {}) {
  if (command.options.dry_run || command.options.no_wait || command.options.json || command.options.help || command.group === "help" || command.group === "version") {
    return;
  }
  try {
    const current = await readPackageVersion();
    const latest = await fetchLatestPackageVersion(deps);
    if (!latest || compareVersions(latest, current) <= 0) return;
    deps.stderr?.write?.([
      `\nFlatkey CLI update available: ${current} -> ${latest}`,
      "Upgrade: npm install -g @flatkey-ai/cli",
      "",
    ].join("\n"));
  } catch {
    // Update checks must never break normal CLI commands.
  }
}

async function fetchLatestPackageVersion(deps = {}) {
  const { CLI_REQUEST_HEADERS } = await import("./requestHeaders.js");
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return undefined;
  const response = await fetchImpl("https://registry.npmjs.org/@flatkey-ai%2fcli/latest", {
    headers: CLI_REQUEST_HEADERS,
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(750)
      : undefined,
  });
  if (!response?.ok) return undefined;
  const body = await response.json();
  return typeof body?.version === "string" ? body.version : undefined;
}

function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseVersionParts(version) {
  return String(version)
    .split("-", 1)[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => Number.isFinite(part) ? part : 0);
}
