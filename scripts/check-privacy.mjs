// Source guard, not a substitute for inspecting release binaries and live network traffic.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const baseline = readJson('privacy-baseline.json');
const pkg = readJson('package.json');
const errors = [];
for (const name of Object.keys(pkg.dependencies ?? {})) {
  if (!baseline.reviewedDependencies.includes(name)) {
    errors.push(`Review new runtime dependency ${name} for data collection before updating privacy-baseline.json.`);
  }
}
const tracker = /(?:googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|doubleclick\.net|clarity\.ms|hotjar\.com|api\.mixpanel\.com|(?:eu|us)\.i\.posthog\.com|@react-native-firebase\/analytics|@segment\/analytics|react-native-fbsdk|react-native-google-mobile-ads|\bfbq\s*\(|\bgtag\s*\()/i;
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(?:test|spec)\./.test(entry.name)) continue;
    else if (['.ts', '.tsx', '.js', '.jsx', '.html'].includes(extname(path)) && tracker.test(readFileSync(path, 'utf8'))) {
      errors.push(`Potential optional tracking in ${relative(root, path)}. Review consent before release.`);
    }
  }
}
scan(resolve(root, 'src'));
scan(resolve(root, 'public'));
if (existsSync(resolve(root, 'index.html')) && tracker.test(readFileSync(resolve(root, 'index.html'), 'utf8'))) {
  errors.push('Potential tracking in index.html. Review consent before release.');
}
if (existsSync(resolve(root, 'app.json'))) {
  const config = readJson('app.json').expo;
  for (const permission of ['com.google.android.gms.permission.AD_ID', 'android.permission.RECORD_AUDIO']) {
    if (!config.android?.blockedPermissions?.includes(permission)) errors.push(`Expected blocked permission: ${permission}`);
  }
  const picker = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker')?.[1];
  if (picker?.microphonePermission !== false) errors.push('Image picker must not request microphone access.');
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Privacy source checks passed. Release SDK/network and operational reviews remain required.');
}
