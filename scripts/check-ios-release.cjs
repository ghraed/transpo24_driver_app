/* global __dirname */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { getConfig } = require('@expo/config');

const root = resolve(__dirname, '..');
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));
// Run with EAS env:exec to check the actual cloud production variables.
Object.assign(process.env, eas.build.production.env, {
  EXPO_NO_DOTENV: '1', EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'ios',
});

try {
  const { exp } = getConfig(root);
  const ios = eas.build.production.ios;
  const errors = [];
  if (ios?.distribution !== 'store') errors.push('iOS production distribution must be store.');
  if (ios?.image !== 'sdk-56') errors.push('Use the SDK 56 iOS build image.');
  if (!ios?.channel || ios.channel === eas.build.production.channel) errors.push('iOS must use a dedicated update channel.');
  if (!exp.version || !exp.scheme) errors.push('App version and URL scheme are required.');
  if (exp.ios?.config?.usesNonExemptEncryption !== false) errors.push('Declare the standard TLS/OS Keychain encryption configuration.');
  for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SOCKET_URL']) {
    if (process.env[key] !== 'https://api.transpo24.com') errors.push(`${key} must use the production HTTPS endpoint.`);
  }
  const location = exp.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-location')?.[1];
  if (!location?.isIosBackgroundLocationEnabled || !location?.locationAlwaysAndWhenInUsePermission) {
    errors.push('Active-trip background location and its permission description are required.');
  }
  if (!exp.plugins.some(plugin => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications')) errors.push('Push notifications must be configured.');
  const icon = readFileSync(resolve(root, typeof exp.ios?.icon === 'string' ? exp.ios.icon : exp.icon));
  if (icon.toString('hex', 0, 8) !== '89504e470d0a1a0a' || icon.readUInt32BE(16) !== 1024 || icon.readUInt32BE(20) !== 1024) {
    errors.push('The iOS app icon must be a 1024 x 1024 PNG.');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`iOS production configuration passed: ${exp.ios.bundleIdentifier}, version ${exp.version}, channel ${ios.channel}.`);
  console.log('Device checks still required: login, maps/routes, document uploads, APNs push, and active-trip tracking while locked/backgrounded.');
} catch (error) {
  console.error(`iOS release check failed: ${error.message}`);
  process.exitCode = 1;
}
