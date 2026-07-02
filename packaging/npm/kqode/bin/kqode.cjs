#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { ensureBinary } = require('../lib/install.cjs');
const { REPO } = require('../lib/resolve.cjs');

/**
 * Launches the platform-specific `kqode` executable, downloading and verifying
 * it on first run if the postinstall step did not (for example after
 * `npm install --ignore-scripts`). Arguments, stdio, and the exit code/signal
 * are forwarded to the executable.
 */
async function main() {
  let binary;
  try {
    binary = await ensureBinary();
  } catch (error) {
    console.error(error.message);
    console.error(`kqode: unable to obtain the executable. Download it manually from`);
    console.error(`  https://github.com/${REPO}/releases`);
    process.exit(1);
  }

  const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`kqode: failed to launch ${binary}: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code === null ? 1 : code);
    }
  });
}

main();
