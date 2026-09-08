#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { loadLocalEnv, projectRoot } = require('./local-env');
const { reversePort } = require('./setup-adb-reverse');

loadLocalEnv();
try {
  reversePort(3001);
  reversePort(8082);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const result = spawnSync('npx', ['expo', 'start', '--dev-client', '--scheme', 'transpo24-driver-dev', '--port', '8082', ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
