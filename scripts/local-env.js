/* global __dirname */
const path = require('node:path');
const { parseProjectEnv } = require('@expo/env');

const projectRoot = path.resolve(__dirname, '..');

function loadLocalEnv() {
  // Local files, including .env.local overrides, own the app configuration.
  // Do not inherit public production values from the launching shell.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('EXPO_PUBLIC_') || key.startsWith('EXPO_ANDROID_') ||
        key.startsWith('EXPO_IOS_') || key.startsWith('EXPO_STRIPE_')) {
      delete process.env[key];
    }
  }
  delete process.env.EAS_BUILD_PROFILE;
  delete process.env.__EXPO_ENV_LOADED;
  delete process.env.EXPO_NO_DOTENV;
  process.env.NODE_ENV = 'development';
  const { env, files } = parseProjectEnv(projectRoot, { mode: 'development' });
  Object.assign(process.env, env);
  process.env.APP_VARIANT = 'development';
  console.log(`Transpo24 Driver Dev: using ${files.map((file) => path.basename(file)).join(', ') || 'no local env files'}`);
}

module.exports = { loadLocalEnv, projectRoot };
