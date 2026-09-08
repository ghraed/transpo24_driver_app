#!/usr/bin/env node

const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { reversePort } = require('./setup-adb-reverse');
const { loadLocalEnv, projectRoot } = require('./local-env');
const { prepareAndroid } = require('./prepare-android');

const BACKEND_PORT = 3001;
const DEFAULT_METRO_PORT = 8082;
const APP_PACKAGE = 'com.transpo24.driver.dev';
const forwardedArgs = process.argv.slice(2);

function stripMetroArgs(args) {
  const strippedArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--clear' || arg === '-c' || arg === '--restart-metro' || arg === '--keep-metro') {
      continue;
    }

    if (arg.startsWith('--port=')) {
      continue;
    }

    if (arg === '--port') {
      index += 1;
      continue;
    }

    strippedArgs.push(arg);
  }

  return strippedArgs;
}

function shouldClearMetroCache(args) {
  return args.includes('--clear') || args.includes('-c');
}

function shouldRestartMetro(args) {
  return shouldClearMetroCache(args) || args.includes('--restart-metro');
}

function getMetroPort(args) {
  const portArg = args.find((arg) => arg.startsWith('--port='));
  if (portArg) {
    const parsed = Number.parseInt(portArg.slice('--port='.length), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const portIndex = args.findIndex((arg) => arg === '--port');
  if (portIndex >= 0) {
    const parsed = Number.parseInt(args[portIndex + 1] ?? '', 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_METRO_PORT;
}

function failWithMessage(error) {
  console.error(error instanceof Error ? error.message : 'Unknown adb reverse error.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isLocalPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function waitForLocalPort(port, timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isLocalPortOpen(port)) {
      return true;
    }

    await sleep(250);
  }

  return false;
}

function getLocalPortListenerPids(port) {
  if (process.platform === 'win32') {
    return [];
  }

  const lookup = spawnSync('lsof', ['-t', '-iTCP:' + port, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });

  if (lookup.status !== 0) {
    return [];
  }

  return lookup.stdout
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function stopLocalPortListeners(port) {
  const pids = getLocalPortListenerPids(port);

  if (pids.length === 0) {
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      console.warn(
        `Failed to stop process ${pid} on port ${port}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

async function main() {
  loadLocalEnv();
  const metroPort = getMetroPort(forwardedArgs);
  const nativeRunArgs = stripMetroArgs(forwardedArgs);
  const clearMetroCache = shouldClearMetroCache(forwardedArgs);
  const restartMetro = shouldRestartMetro(forwardedArgs);

  try {
    reversePort(BACKEND_PORT);
    if (metroPort !== BACKEND_PORT) {
      reversePort(metroPort);
    }
    prepareAndroid();
  } catch (error) {
    failWithMessage(error);
  }

  let metroProcess = null;
  const stopMetro = (signal = 'SIGTERM') => {
    if (metroProcess && !metroProcess.killed) {
      metroProcess.kill(signal);
    }
  };

  let metroAlreadyRunning = await isLocalPortOpen(metroPort);

  if (metroAlreadyRunning && restartMetro) {
    console.log(`Stopping the existing Metro server on port ${metroPort}...`);
    stopLocalPortListeners(metroPort);
    const deadline = Date.now() + 5000;
    do {
      await sleep(100);
      metroAlreadyRunning = await isLocalPortOpen(metroPort);
    } while (metroAlreadyRunning && Date.now() < deadline);

    if (metroAlreadyRunning) {
      console.error(
        `Metro is still running on port ${metroPort}. Stop it manually and rerun this command.`,
      );
      process.exit(1);
    }
  }

  if (metroAlreadyRunning) {
    console.log(
      `Metro is already running on port ${metroPort}. Reusing the existing Expo dev server.`,
    );
  } else {
    const metroArgs = ['expo', 'start', '--dev-client', '--scheme', 'transpo24-driver-dev', '--port', String(metroPort)];
    if (clearMetroCache) {
      metroArgs.push('--clear');
    }

    metroProcess = spawn('npx', metroArgs, {
      stdio: 'inherit',
    });

    const metroReady = await waitForLocalPort(metroPort);
    if (!metroReady) {
      stopMetro();
      console.error(`Metro did not become reachable on port ${metroPort}.`);
      process.exit(1);
    }
  }

  process.on('SIGINT', () => {
    stopMetro('SIGINT');
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    stopMetro('SIGTERM');
    process.exit(143);
  });

  const runResult = spawnSync('npx', [
    'expo', 'run:android', '--port', String(metroPort),
    '--app-id', APP_PACKAGE, ...nativeRunArgs,
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (runResult.status !== 0) {
    stopMetro();
    process.exit(runResult.status ?? 1);
  }

  if (!metroProcess) {
    process.exit(0);
  }

  metroProcess.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

void main();
