const COMMANDS = new Set([
  "audio",
  "credits",
  "help",
  "image",
  "models",
  "onboard",
  "status",
  "version",
  "video",
]);

const GROUP_ACTIONS = new Set(["audio", "image", "video"]);

export function parseArgv(argv) {
  const [group, maybeAction, ...rest] = argv;
  if (!group) {
    return { group: "help", action: undefined, options: {} };
  }
  if (!COMMANDS.has(group)) {
    throw new Error(`Unknown command: ${group}`);
  }

  const hasAction = GROUP_ACTIONS.has(group);
  const action = hasAction ? maybeAction : undefined;
  const optionTokens = hasAction ? rest : argv.slice(1);

  return {
    group,
    action,
    options: parseOptions(optionTokens),
  };
}

function parseOptions(tokens) {
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
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

export async function main(argv) {
  const command = parseArgv(argv);
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
    const { getAiHelp, getHumanHelp } = await import("./help.js");
    return command.options.ai ? getAiHelp() : getHumanHelp();
  }
  if (command.group === "version") {
    return { version: "0.1.0" };
  }

  if (command.group === "models") {
    return handleModels(command, deps);
  }

  if (command.group === "credits" || command.group === "status") {
    return handleUtility(command, deps);
  }

  if (["image", "video", "audio"].includes(command.group)) {
    if (command.action !== "generate") {
      throw new Error(`Unknown action for ${command.group}: ${command.action}`);
    }
    return handleGenerate(command, { ...deps, stdout, stderr });
  }

  throw new Error(`Unknown command: ${command.group}`);
}

async function handleGenerate(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const { generateAudio, generateImage, generateVideo } = await import("./api.js");
  const { persistArtifacts } = await import("./artifacts.js");
  const { createAnimation } = await import("./animation.js");
  const apiKey = await resolveApiKey({
    apiKey: command.options.api_key,
    env: deps.env ?? process.env,
  });
  const options = {
    ...command.options,
    apiKey,
    baseUrl: command.options.base_url,
    fetch: deps.fetch,
  };
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
        : await generateAudio(options);
    const artifacts = await persistArtifacts({
      kind: command.group,
      response,
      outDir: command.options.out ?? "flatkey-output",
    });
    return { kind: command.group, artifacts, response };
  } finally {
    animation.stop();
  }
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
    baseUrl: command.options.base_url,
    fetch: deps.fetch,
  };
  return command.group === "credits" ? getCredits(options) : getStatus(options);
}

async function handleModels(command, deps) {
  const { resolveApiKey } = await import("./config.js");
  const { getModels } = await import("./api.js");
  const { getBundledModels, normalizeModels } = await import("./models.js");

  try {
    const apiKey = await resolveApiKey({
      apiKey: command.options.api_key,
      env: deps.env ?? process.env,
    });
    const response = await getModels({
      apiKey,
      baseUrl: command.options.base_url,
      fetch: deps.fetch,
    });
    const models = normalizeModels(response, command.options.type);
    return { models: models.length ? models : getBundledModels(command.options.type) };
  } catch {
    return { models: getBundledModels(command.options.type) };
  }
}

function formatHuman(result) {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}
