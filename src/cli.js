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
  process.stdout.write(`${JSON.stringify(command)}\n`);
}
