/* global __dirname */
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const usage = `Usage:
  transpo_dbuild                 Validate, bump version, build Android locally and iOS in EAS cloud.
  transpo_dbuild --no-bump       Validate and build using the current app version (retry).
  transpo_dupload                Upload the local Android AAB, then select an iOS cloud build.
  transpo_dupload --platform ios Upload only iOS (also accepts android).
Both commands always run in driver_mobile. Uploading does not publish a store release.`;

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed${result.signal ? ` (${result.signal})` : ''}.`);
    error.exitCode = result.status || 1;
    throw error;
  }
}

function runRelease(args, { root = projectRoot, run = runCommand, log = console.log } = {}) {
  if (args.includes('--help') || args.includes('-h')) {
    log(usage);
    return;
  }
  const [action, ...options] = args;
  const exec = (command, commandArgs) => run(command, commandArgs, root);
  const eas = (commandArgs) => exec('npx', ['eas-cli@latest', ...commandArgs]);
  const androidArtifact = (version) => resolve(root, 'dist', 'releases', `transpo24-driver-${version}.aab`);

  if (action === 'build') {
    if (options.length && (options.length !== 1 || options[0] !== '--no-bump')) {
      throw new Error(usage);
    }
    const appPath = resolve(root, 'app.json');
    const config = JSON.parse(readFileSync(appPath, 'utf8'));
    const version = config.expo?.version;
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version || '');
    if (!match) throw new Error('app.json expo.version must use major.minor.patch (for example 1.0.2).');

    for (const script of ['lint', 'typecheck', 'test', 'ios:release:check']) {
      exec('npm', ['run', script]);
    }

    if (!options.includes('--no-bump')) {
      config.expo.version = `${match[1]}.${match[2]}.${BigInt(match[3]) + 1n}`;
      writeFileSync(appPath, `${JSON.stringify(config, null, 2)}\n`);
      log(`App version: ${version} -> ${config.expo.version} (both platforms).`);
    } else {
      log(`Keeping app version ${version}. EAS still increments native build numbers.`);
    }
    const artifact = androidArtifact(config.expo.version);
    mkdirSync(resolve(root, 'dist', 'releases'), { recursive: true });
    try {
      log('Building Android locally. Production secrets/file variables must be available locally; EAS downloads signing credentials.');
      eas(['build', '--platform', 'android', '--profile', 'production', '--local', '--output', artifact]);
      log(`Android AAB: ${artifact}`);
      log('Building iOS in EAS cloud.');
      eas(['build', '--platform', 'ios', '--profile', 'production']);
    } catch (error) {
      log(`App version remains ${config.expo.version}. To retry without another patch increment, use transpo_dbuild --no-bump.`);
      throw error;
    }
    log('Builds finished. Test the builds before running transpo_dupload. Commit app.json with the release changes.');
    return;
  }

  if (action === 'upload') {
    let platforms = ['android', 'ios'];
    if (options.length) {
      if (options.length !== 2 || options[0] !== '--platform' || !platforms.includes(options[1])) {
        throw new Error(usage);
      }
      platforms = [options[1]];
    }
    const version = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo.version;
    const artifact = androidArtifact(version);
    if (platforms.includes('android') && !existsSync(artifact)) {
      throw new Error(`Local Android AAB not found: ${artifact}. Run transpo_dbuild first, or use --platform ios to upload only iOS.`);
    }
    if (platforms.includes('android')) log(`Uploading Android AAB: ${artifact}`);
    if (platforms.includes('ios')) log('Select the driver iOS production build when prompted. Use com.transpo24.driver under Autobasilea GmbH; create the driver App Store Connect app if needed.');
    log('Complete store review/release in the store consoles after upload.');
    for (const platform of platforms) {
      eas(['submit', '--platform', platform, '--profile', 'production',
        ...(platform === 'android' ? ['--path', artifact] : [])]);
    }
    return;
  }
  throw new Error(usage);
}

if (require.main === module) {
  try {
    runRelease(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}

module.exports = { runRelease };
