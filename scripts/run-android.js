#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const forwardedArgs = process.argv.slice(2);

const adbReverse = spawnSync('adb', ['reverse', 'tcp:3000', 'tcp:3000'], {
  stdio: 'inherit',
});

if (adbReverse.status !== 0) {
  process.exit(adbReverse.status ?? 1);
}

const expoRunAndroid = spawnSync('npx', ['expo', 'run:android', ...forwardedArgs], {
  stdio: 'inherit',
});

process.exit(expoRunAndroid.status ?? 1);
