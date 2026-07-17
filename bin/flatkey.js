#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  if (process.argv.includes("--json")) {
    process.stderr.write(`${JSON.stringify({ error: { message: error.message } })}\n`);
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
