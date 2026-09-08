#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { loadLocalEnv, projectRoot } = require('./local-env');

loadLocalEnv();
const result = spawnSync('npx', ['expo', ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
