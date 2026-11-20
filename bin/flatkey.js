#!/usr/bin/env node
import { main } from "../src/cli.js";

const args = process.argv.slice(2);
main(args).catch((error) => {
  const jsonIndex = args.findLastIndex((arg) => arg === "--json" || arg.startsWith("--json="));
  if (jsonIndex >= 0 && args[jsonIndex] !== "--json=false" && !(args[jsonIndex] === "--json" && args[jsonIndex + 1] === "false")) {
    const { message, code, status, requestId, retryAfterMs, taskId, taskStatus, finishReason } = error;
    process.stderr.write(`${JSON.stringify({ error: {
      message, code, status, requestId, retryAfterMs, taskId, taskStatus, finishReason,
    } })}\n`);
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
