#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { reversePort } = require('./setup-adb-reverse');

const forwardedArgs = process.argv.slice(2);

try {
  reversePort(3001);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unknown adb reverse error.');
  process.exit(1);
}

const expoRunAndroid = spawnSync('npx', ['expo', 'run:android', ...forwardedArgs], {
  stdio: 'inherit',
});

process.exit(expoRunAndroid.status ?? 1);
