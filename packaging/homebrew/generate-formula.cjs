#!/usr/bin/env node
'use strict';

// Thin IO wrapper around `formula.cjs`. Reads a GitHub Release `checksums.txt`
// (the exact file `release.yml` uploads), parses each `<sha256>  <archive>`
// line, and writes the rendered `Formula/kqode.rb`. The publish workflow runs
// this after a release; a maintainer can run it locally to seed the tap.

const fs = require('node:fs');
const path = require('node:path');

const { renderFormula } = require('./formula.cjs');

/** Parses `--key value` and `--key=value` flags into a Map (bare flags become `'true'`). */
function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq !== -1) {
      args.set(token.slice(2, eq), token.slice(eq + 1));
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args.set(token.slice(2), argv[(i += 1)]);
    } else {
      args.set(token.slice(2), 'true');
    }
  }
  return args;
}

/**
 * Parses `checksums.txt` into a `{ [archive]: sha256 }` map.
 *
 * Accepts the `sha256sum` line shape `<64-hex>  <name>` (two spaces) as well as
 * the binary-mode `<64-hex> *<name>` variant, ignoring blank lines.
 */
function parseChecksums(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (match) {
      map[match[2].trim()] = match[1].toLowerCase();
    }
  }
  return map;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const checksumsPath = args.get('checksums');
  const rawVersion = args.get('version');
  if (!checksumsPath) throw new Error('missing required --checksums <file>');
  if (!rawVersion) throw new Error('missing required --version <x.y.z>');

  const version = rawVersion.replace(/^v/, '');
  const checksums = parseChecksums(fs.readFileSync(checksumsPath, 'utf8'));
  const formula = renderFormula({ version, checksums });

  const out = args.get('out') ?? path.join(process.cwd(), 'kqode.rb');
  fs.writeFileSync(out, formula);
  console.log(`Wrote Homebrew formula for v${version} -> ${out}`);
}

module.exports = { main, parseArgs, parseChecksums };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`generate-formula: ${error.message}`);
    process.exit(1);
  }
}
