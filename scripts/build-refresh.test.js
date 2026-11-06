/* global __dirname */
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workspaces = [];
afterAll(() => { for (const workspace of workspaces) fs.rmSync(workspace, { recursive: true, force: true }); });
function fixture() {
  const workspace = fs.mkdtempSync('/tmp/transpo24-staging-' + path.basename(root) + '-');
  workspaces.push(workspace);
  const source = path.join(workspace, 'source');
  fs.mkdirSync(path.join(source, 'android/app'), { recursive: true });
  const bytes = Buffer.from('synthetic native Firebase input');
  fs.writeFileSync(path.join(source, 'android/app/google-services.json'), bytes);
  fs.writeFileSync(path.join(workspace, 'staging-google-services.json'), bytes);
  fs.writeFileSync(path.join(workspace, 'artifact.json'), JSON.stringify({ source, firebase: true, firebaseConfigSha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
  return { workspace, source };
}
function attempt(source) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/build-controlled-staging.cjs'), '--refresh-js', source], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 5000 });
}
test('a changed retained Firebase file is refused before source copying or Gradle', () => {
  const { workspace, source } = fixture();
  fs.writeFileSync(path.join(workspace, 'staging-google-services.json'), 'changed');
  const result = attempt(source);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Firebase native inputs changed; use a fresh build');
  expect(fs.existsSync(path.join(source, 'package.json'))).toBe(false);
});
test('a native config that no longer matches the successful artifact hash is refused', () => {
  const { workspace, source } = fixture();
  fs.writeFileSync(path.join(workspace, 'staging-google-services.json'), 'changed');
  fs.writeFileSync(path.join(source, 'android/app/google-services.json'), 'changed');
  const result = attempt(source);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Firebase native inputs changed; use a fresh build');
  expect(fs.existsSync(path.join(source, 'package.json'))).toBe(false);
});
