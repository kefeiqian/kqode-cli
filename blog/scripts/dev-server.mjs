#!/usr/bin/env node
// Auto-restarting Docusaurus dev server for local authoring.
//
// Docusaurus loads docusaurus.config.ts, sidebars.ts, plugins, and the doc
// route table once at startup, so structural changes (new/renamed/deleted docs
// or images, _category_.json, config, sidebars, plugins) are never hot-reloaded
// and normally force a manual restart. This wrapper runs `docusaurus start` and
// automatically restarts it when such files change, while leaving in-place
// content edits to Docusaurus hot reload (see dev-watch-poll.cjs).
//
// Restarts are serialized: we always AWAIT the current server's full exit (and,
// on Windows, the `taskkill /t /f`) before spawning the next one, so there is
// no stray async kill that could hit a reused PID and no orphaned server. It
// never respawns after an external stop (e.g. kqode-blog-stop) or a crash, so
// killing the port-3000 process cleanly tears the whole thing down.

import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOST = '127.0.0.1';
const PORT = 3000;
const RESTART_DEBOUNCE_MS = 400;
const PORT_RELEASE_TIMEOUT_MS = 10_000;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const blogRoot = resolve(scriptDir, '..');
const docusaurusBin = join(blogRoot, 'node_modules', '@docusaurus', 'core', 'bin', 'docusaurus.mjs');
// Kept in the OS temp dir, not blog/.docusaurus, because Docusaurus wipes
// .docusaurus on every `start`, which would delete the pid file.
const pidFile = join(tmpdir(), 'kqode-blog-dev.pid');
const extraArgs = process.argv.slice(2); // e.g. `--locale en`

let child = null;
let restarting = false;
let pendingReason = null;
let shuttingDown = false;
let restartTimer = null;

const log = (message) => console.log(`[blog-dev] ${message}`);

// Decide whether a watched filesystem event requires a full server restart.
// Content edits to existing docs are left to hot reload; only structural
// changes and boot-time files (config/sidebars/plugins/theme) restart.
function needsRestart(path, event) {
  const p = path.replace(/\\/g, '/');
  if (p.endsWith('_category_.json')) return true; // label/position/add/remove
  if (p.includes('/docs/') || p.includes('/i18n/')) {
    return event === 'add' || event === 'unlink' || event === 'addDir' || event === 'unlinkDir';
  }
  if (event === 'change' && p.endsWith('.css')) return false; // CSS hot-reloads
  return true; // docusaurus.config.ts, sidebars.ts, src/**, static/**, package.json, tsconfig.json
}

function waitPortFree() {
  const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
  return new Promise((done) => {
    const probe = () => {
      const socket = createConnection({host: HOST, port: PORT});
      socket.once('connect', () => {
        socket.destroy();
        if (Date.now() > deadline) done();
        else setTimeout(probe, 200);
      });
      socket.once('error', () => {
        socket.destroy();
        done();
      });
    };
    probe();
  });
}

function spawnServer() {
  const proc = spawn(
    process.execPath,
    [docusaurusBin, 'start', '--host', HOST, '--port', String(PORT), '--no-open', ...extraArgs],
    {cwd: blogRoot, stdio: 'inherit', env: process.env},
  );
  child = proc;
  proc.once('exit', (code, signal) => {
    if (child === proc) child = null;
    // A controlled restart or shutdown awaits this exit itself (via killChild).
    if (restarting || shuttingDown) return;
    log(`docusaurus exited (${signal ?? code}) — external stop or crash; not respawning.`);
    cleanup();
    process.exit(typeof code === 'number' ? code : 0);
  });
}

// Kill the current server and resolve only once it has fully exited. On Windows
// we spawn `taskkill /t /f` (kills the process tree) and rely on the child's
// own `exit` event to resolve, so the caller can safely spawn the replacement
// afterwards without racing a lingering kill.
function killChild() {
  const proc = child;
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    proc.once('exit', () => done());
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {stdio: 'ignore'});
    } else {
      try {
        proc.kill('SIGTERM');
      } catch {
        done();
      }
    }
  });
}

async function restart() {
  if (shuttingDown || restarting) return;
  restarting = true;
  while (pendingReason && !shuttingDown) {
    const reason = pendingReason;
    pendingReason = null;
    log(`restarting — ${reason}`);
    await killChild();
    await waitPortFree();
    if (shuttingDown) break;
    spawnServer();
  }
  restarting = false;
  // Handle an event that slipped in exactly as we cleared the flag.
  if (pendingReason && !shuttingDown) scheduleRestart(pendingReason);
}

function scheduleRestart(reason) {
  if (shuttingDown) return;
  pendingReason = reason;
  if (restarting) return; // the running restart loop will consume pendingReason
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void restart();
  }, RESTART_DEBOUNCE_MS);
}

function writePidFile() {
  try {
    writeFileSync(pidFile, String(process.pid));
  } catch {
    // best effort; kqode-blog-stop also finds us by port 3000
  }
}

function cleanup() {
  try {
    rmSync(pidFile, {force: true});
  } catch {
    // ignore
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}; shutting down.`);
  if (restartTimer) clearTimeout(restartTimer);
  await killChild();
  cleanup();
  process.exit(0);
}

async function startWatcher() {
  const {default: chokidar} = await import('chokidar');
  const watched = [
    join(blogRoot, 'docusaurus.config.ts'),
    join(blogRoot, 'sidebars.ts'),
    join(blogRoot, 'tsconfig.json'),
    join(blogRoot, 'package.json'),
    join(blogRoot, 'src'),
    join(blogRoot, 'docs'),
    join(blogRoot, 'i18n'),
    join(blogRoot, 'static'),
  ];
  const watcher = chokidar.watch(watched, {
    ignoreInitial: true,
    usePolling: true,
    interval: 700,
    binaryInterval: 1200,
    ignored: (p) => /[\\/](node_modules|\.docusaurus|build|\.git)[\\/]/.test(p),
    awaitWriteFinish: {stabilityThreshold: 300, pollInterval: 100},
  });
  const onEvent = (event) => (path) => {
    if (needsRestart(path, event)) scheduleRestart(`${event} ${path}`);
  };
  watcher
    .on('add', onEvent('add'))
    .on('addDir', onEvent('addDir'))
    .on('unlink', onEvent('unlink'))
    .on('unlinkDir', onEvent('unlinkDir'))
    .on('change', onEvent('change'));
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

writePidFile();
log(`pid ${process.pid} · pidfile ${pidFile}`);
log(`starting docusaurus on http://${HOST}:${PORT}/ (auto-restart on structural changes)`);
spawnServer();
startWatcher().catch((error) => {
  log(`file watcher failed to start: ${error}`);
});
