#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { resolveBinary, describeResolutionError } = require('../lib/locate.cjs');

/**
 * Launches the platform-specific `kqode` executable that npm installed as an
 * optional dependency (or the `KQODE_BINARY_PATH` override), forwarding
 * arguments, stdio, and the exit code/signal.
 *
 * No download happens: the executable ships inside its platform package, so a
 * completed `npm install` is fully self-contained and works offline.
 */
function main() {
  let binary;
  try {
    binary = resolveBinary();
  } catch (error) {
    console.error(describeResolutionError(error));
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
