#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const BACKEND_PORT = 3000;

function runAdbCommand(args) {
  return spawnSync('adb', args, {
    encoding: 'utf8',
  });
}

function fail(message) {
  throw new Error(message);
}

function ensureAdbInstalled() {
  const adbVersion = runAdbCommand(['version']);

  if (adbVersion.error && adbVersion.error.code === 'ENOENT') {
    fail(
      'adb is not installed or not on PATH. Install Android platform-tools and confirm `adb devices` works.',
    );
  }

  if (adbVersion.status !== 0) {
    fail(adbVersion.stderr.trim() || 'Failed to run `adb version`.');
  }
}

function getConnectedDevices() {
  const devicesResult = runAdbCommand(['devices']);

  if (devicesResult.status !== 0) {
    fail(devicesResult.stderr.trim() || 'Failed to list adb devices.');
  }

  const rawLines = devicesResult.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  const attachedDevices = rawLines
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    })
    .filter((device) => device.serial);

  const readyDevices = attachedDevices.filter((device) => device.state === 'device');

  if (readyDevices.length === 0) {
    const unavailableStates = attachedDevices
      .map((device) => `${device.serial} (${device.state})`)
      .join(', ');

    fail(
      unavailableStates
        ? `No ready Android USB device found. Current adb devices: ${unavailableStates}.`
        : 'No Android USB device detected. Connect a device, enable USB debugging, and confirm it appears in `adb devices`.',
    );
  }

  if (readyDevices.length > 1) {
    fail(
      `Multiple adb devices are connected (${readyDevices.map((device) => device.serial).join(', ')}). Disconnect extras or run adb reverse manually for the target device.`,
    );
  }

  return readyDevices;
}

function reversePort(port = BACKEND_PORT) {
  ensureAdbInstalled();
  const [device] = getConnectedDevices();
  const portMapping = `tcp:${port}`;

  const reverseResult = runAdbCommand(['reverse', portMapping, portMapping]);

  if (reverseResult.status !== 0) {
    fail(reverseResult.stderr.trim() || `Failed to run \`adb reverse ${portMapping} ${portMapping}\`.`);
  }

  console.log(
    `adb reverse is ready for backend port ${port} on device ${device.serial}. Android USB can use http://127.0.0.1:${port}.`,
  );
}

if (require.main === module) {
  try {
    reversePort();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown adb reverse error.';
    console.error(message);
    process.exit(1);
  }
}

module.exports = {
  reversePort,
};
