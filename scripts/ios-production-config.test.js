const originalEnv = process.env;

function resolveConfig(overrides = {}, bundleIdentifier = 'com.transpo24.driver') {
  process.env = {
    ...originalEnv, APP_VARIANT: '', EAS_BUILD_PROFILE: 'production', EAS_BUILD_PLATFORM: 'ios',
    EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: `AIza${'a'.repeat(35)}`,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: '', ...overrides,
  };
  let result;
  jest.isolateModules(() => {
    result = require('../app.config').default({ config: {
      name: 'Transpo24 - Driver', slug: 'driver_mobile',
      ios: { bundleIdentifier }, android: { package: 'com.transpo24.driver' },
    } });
  });
  return result;
}

afterEach(() => { process.env = originalEnv; });

test('accepts the driver production identity and Maps key', () => {
  expect(resolveConfig().ios.bundleIdentifier).toBe('com.transpo24.driver');
});
test.each(['', 'replace_with_your_google_maps_ios_api_key'])('rejects missing or placeholder production Maps keys: %s', key => {
  expect(() => resolveConfig({ EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: key })).toThrow('EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY');
});
test('prevents a development variant from shipping to the App Store', () => {
  expect(() => resolveConfig({ APP_VARIANT: 'development' })).toThrow('APP_VARIANT');
});
test('rejects the client app identity for a driver release', () => {
  expect(() => resolveConfig({}, 'com.transpo24.app')).toThrow('com.transpo24.driver');
});
test('allows preview builds without imposing the production key requirement', () => {
  expect(resolveConfig({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY: '' }).ios.config.googleMapsApiKey).toBe('');
});
