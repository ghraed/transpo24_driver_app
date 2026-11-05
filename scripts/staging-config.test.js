const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const originalEnv = process.env;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transpo24-config-test-'));
function configure(overrides = {}) {
  process.env = { ...originalEnv, APP_VARIANT: 'staging', EAS_BUILD_PROFILE: '', EAS_BUILD_PLATFORM: 'android', EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE: '', EXPO_PUBLIC_STRIPE_MODE: 'test', EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY: 'pk_test_synthetic_config', ...overrides };
  let result;
  jest.isolateModules(() => {
    result = require('../app.config').default({ config: { name: 'Synthetic', slug: 'synthetic', android: { package: 'com.transpo24.driver' }, ios: { bundleIdentifier: 'com.transpo24.driver' }, updates: { enabled: true } } });
  });
  return result;
}
afterEach(() => { process.env = originalEnv; });
afterAll(() => { fs.rmSync(directory, { recursive: true, force: true }); });
test('staging keeps separate identities, disables OTA and does not inherit production Firebase', () => {
 const config = configure();
 expect(config.android.package).toBe('com.transpo24.driver.staging');
 expect(config.ios.bundleIdentifier).toBe('com.transpo24.driver.staging');
 expect(config.updates.enabled).toBe(false);
 expect(config.android.googleServicesFile).toBeUndefined();
});
test('staging accepts only Firebase files registering its own package', () => {
 const file = path.join(directory, 'google-services.json');
 const write = packageName => fs.writeFileSync(file, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: packageName } } }] }));
 write('com.transpo24.driver');
 expect(() => configure({ EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE: file })).toThrow('register com.transpo24.driver.staging');
 write('com.transpo24.driver.staging');
 expect(configure({ EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE: file }).android.googleServicesFile).toBe(file);
});
