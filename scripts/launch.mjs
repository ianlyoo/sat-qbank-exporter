import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(ROOT_DIR, '.sat-exporter');
const SETUP_MARKER_PATH = path.join(STATE_DIR, 'launcher-setup.json');
const SERVER_LOG_PATH = path.join(STATE_DIR, 'launcher-server.log');
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const SERVER_URL = `http://localhost:${PORT}`;
const MIN_NODE_MAJOR = 20;
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function log(message) {
  console.log(`[launcher] ${message}`);
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    fail(
      `Node.js ${MIN_NODE_MAJOR}+ is required. Detected ${process.version}. Install a newer Node.js release and run the launcher again.`
    );
  }
}

function runCommand(command, args, description) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(`${description} failed.`);
  }
}

async function canReachServer() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: PORT });

    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });

    socket.setTimeout(600, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function ensureSetupDirectory() {
  await fsp.mkdir(STATE_DIR, { recursive: true });
}

async function isPlaywrightReady() {
  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    return false;
  }

  try {
    const { chromium } = await import('playwright');
    const executablePath = chromium.executablePath();
    return Boolean(executablePath && fs.existsSync(executablePath));
  } catch {
    return false;
  }
}

async function needsInitialSetup() {
  if (!fs.existsSync(SETUP_MARKER_PATH)) {
    return true;
  }

  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    return true;
  }

  return !(await isPlaywrightReady());
}

async function writeSetupMarker() {
  await ensureSetupDirectory();
  await fsp.writeFile(
    SETUP_MARKER_PATH,
    JSON.stringify(
      {
        version: 1,
        completedAt: new Date().toISOString(),
        nodeVersion: process.version,
      },
      null,
      2
    )
  );
}

async function ensureInitialSetup() {
  const setupNeeded = await needsInitialSetup();
  if (!setupNeeded) {
    return;
  }

  log('Initial setup required. Installing dependencies and Playwright Chromium...');
  runCommand(NPM_COMMAND, ['install'], 'npm install');
  runCommand(process.execPath, [path.join(ROOT_DIR, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], 'Playwright Chromium install');
  await writeSetupMarker();
  log('Initial setup complete.');
}

async function waitForServerReady(timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachServer()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}

function startServerProcess() {
  const logFd = fs.openSync(SERVER_LOG_PATH, 'a');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });

  child.unref();
}

function openBrowser() {
  if (isTruthyEnv(process.env.SAT_EXPORTER_SKIP_BROWSER)) {
    log(`Browser launch skipped. Open ${SERVER_URL} manually.`);
    return;
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', SERVER_URL], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  if (process.platform === 'darwin') {
    spawn('open', [SERVER_URL], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }

  spawn('xdg-open', [SERVER_URL], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

async function main() {
  ensureNodeVersion();
  await ensureSetupDirectory();

  const npmVersionCheck = spawnSync(NPM_COMMAND, ['--version'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
  });

  if (npmVersionCheck.status !== 0) {
    fail('npm is required but was not found. Reinstall Node.js and run the launcher again.');
  }

  await ensureInitialSetup();

  if (await canReachServer()) {
    log(`Existing local server detected at ${SERVER_URL}. Opening the browser...`);
    openBrowser();
    return;
  }

  log('Starting the local SAT exporter server...');
  startServerProcess();

  const ready = await waitForServerReady();
  if (!ready) {
    fail(`The local server did not start correctly. Check ${SERVER_LOG_PATH} for details.`);
  }

  log(`Opening ${SERVER_URL}`);
  openBrowser();
}

await main();
