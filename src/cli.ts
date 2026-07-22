#!/usr/bin/env node
import { createCli } from "./cli-program.js";

createCli()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`terseforge: ${message}\n`);
    process.exitCode = 1;
  });
