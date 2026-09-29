const { Buffer } = require('node:buffer');
const { fileHookTransform } = require('../fingerprint.config');
const source = { type: 'file', filePath: 'node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml' };
const fresh = '<manifest package="org.reactnative.maskedview" xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n';
const built = fresh.replace('package="org.reactnative.maskedview"', '');
test('fresh install and Gradle-rewritten manifest produce the same fingerprint input', () => {
  const expected = fileHookTransform(source, built, true);
  expect(fileHookTransform(source, fresh, true)).toBe(expected);
  for (const chunk of fresh) expect(fileHookTransform(source, Buffer.from(chunk), false)).toBeNull();
  expect(fileHookTransform(source, null, true)).toBe(expected);
});
test('preserves meaningful manifest changes and other files', () => {
  expect(fileHookTransform(source, fresh.replace('</manifest>', '<uses-permission android:name="example"/></manifest>'), true)).not.toBe(fileHookTransform(source, fresh, true));
  expect(fileHookTransform({ type: 'file', filePath: 'other/AndroidManifest.xml' }, fresh, true)).toBe(fresh);
});
