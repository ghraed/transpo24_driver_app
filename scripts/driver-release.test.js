const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { runRelease } = require('./driver-release.cjs');

let root;
let calls;
let run;
const version = () => JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
const release = (args) => runRelease(args, { root, run, log: () => {} });
const artifact = (appVersion = '1.0.9') => join(root, 'dist', 'releases', `transpo24-driver-${appVersion}.aab`);
const createArtifact = () => {
  mkdirSync(join(root, 'dist', 'releases'), { recursive: true });
  writeFileSync(artifact(), 'test artifact');
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'transpo-release-'));
  writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { version: '1.0.9', name: 'Transpo24 - Driver' } }));
  calls = [];
  run = (command, args, cwd) => calls.push({ command, args, cwd });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('checks first, increments once for both platforms, and always uses the project directory', () => {
  release(['build']);
  expect(calls.map(({ args }) => args)).toEqual([
    ['run', 'lint'], ['run', 'typecheck'], ['run', 'test'], ['run', 'ios:release:check'],
    ['eas-cli@latest', 'build', '--platform', 'android', '--profile', 'production', '--local', '--output', artifact('1.0.10')],
    ['eas-cli@latest', 'build', '--platform', 'ios', '--profile', 'production'],
  ]);
  expect(calls.every(({ cwd }) => cwd === root)).toBe(true);
  expect(version()).toBe('1.0.10');
  expect(JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.name).toBe('Transpo24 - Driver');
});

test.each(['lint', 'typecheck', 'test', 'ios:release:check'])('failed %s prevents a version bump and cloud builds', (failed) => {
  run = (command, args) => {
    calls.push({ command, args });
    if (args[1] === failed) throw new Error('check failed');
  };
  expect(() => release(['build'])).toThrow('check failed');
  expect(version()).toBe('1.0.9');
  expect(calls.every(({ command }) => command === 'npm')).toBe(true);
});

test('failed local build stops before iOS and supports retry without another version increment', () => {
  run = (command, args) => {
    calls.push({ command, args });
    if (command === 'npx') throw new Error('local failure');
  };
  expect(() => release(['build'])).toThrow('local failure');
  expect(calls.some(({ args }) => args.includes('ios'))).toBe(false);
  expect(version()).toBe('1.0.10');
  run = () => {};
  release(['build', '--no-bump']);
  expect(version()).toBe('1.0.10');
});

test('upload sends the exact local AAB and selects iOS interactively without changing the version', () => {
  createArtifact();
  release(['upload']);
  expect(calls.map(({ args }) => args)).toEqual([
    ['eas-cli@latest', 'submit', '--platform', 'android', '--profile', 'production', '--path', artifact()],
    ['eas-cli@latest', 'submit', '--platform', 'ios', '--profile', 'production'],
  ]);
  expect(calls.every(({ cwd }) => cwd === root)).toBe(true);
  expect(version()).toBe('1.0.9');
});

test('upload stops on failure and can retry only the remaining platform', () => {
  createArtifact();
  run = () => { throw new Error('upload failed'); };
  expect(() => release(['upload'])).toThrow('upload failed');
  run = (command, args, cwd) => calls.push({ command, args, cwd });
  release(['upload', '--platform', 'ios']);
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toContain('ios');
});

test('missing local AAB blocks submission but still allows an iOS-only upload', () => {
  expect(() => release(['upload'])).toThrow('Local Android AAB not found:');
  expect(calls).toHaveLength(0);
  release(['upload', '--platform', 'ios']);
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toContain('ios');
});

test('an AAB from another app version cannot be uploaded as the current release', () => {
  createArtifact();
  writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { version: '1.0.10' } }));
  expect(() => release(['upload'])).toThrow('transpo24-driver-1.0.10.aab');
  expect(calls).toHaveLength(0);
});

test('help and invalid arguments never run external commands or change the version', () => {
  release(['build', '--help']);
  expect(() => release(['build', '--unknown'])).toThrow('Usage:');
  expect(() => release(['upload', '--platform', 'all'])).toThrow('Usage:');
  expect(calls).toHaveLength(0);
  expect(version()).toBe('1.0.9');
});
