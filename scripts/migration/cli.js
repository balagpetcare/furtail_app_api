#!/usr/bin/env node

const { runCli } = require('./legacy-migration');

runCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
