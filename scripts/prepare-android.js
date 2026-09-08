const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getConfig } = require('@expo/config');
const { projectRoot } = require('./local-env');

function prepareAndroid() {
  const { exp } = getConfig(projectRoot);
  const androidDir = path.join(projectRoot, 'android');
  const gradlePath = path.join(androidDir, 'app/build.gradle');
  const gradle = fs.existsSync(gradlePath) ? fs.readFileSync(gradlePath, 'utf8') : '';
  const existingPackage = gradle.match(/applicationId\s+["']([^"']+)["']/)?.[1];
  const hasFirebase = gradle.includes('apply plugin: "com.google.gms.google-services"');
  const needsClean = fs.existsSync(androidDir) &&
    (existingPackage !== exp.android.package || hasFirebase !== Boolean(exp.android.googleServicesFile));

  if (needsClean) {
    // Preserve native sources before regenerating the ignored Android project.
    const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'transpo24-driver-android-'));
    fs.cpSync(androidDir, path.join(backup, 'android'), {
      recursive: true,
      filter: (source) => !['build', '.gradle', '.cxx'].includes(path.basename(source)),
    });
    console.log(`Switching Android app variant. Native source backup: ${backup}`);
  }

  const result = spawnSync('npx', [
    'expo', 'prebuild', '--platform', 'android', '--no-install',
    ...(needsClean ? ['--clean'] : []),
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('Android prebuild failed. The app was not installed.');
  }
}

module.exports = { prepareAndroid };
