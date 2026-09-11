const { Buffer } = require('node:buffer');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fileHookTransform } = require('../fingerprint.config');
const source = { type: 'file', filePath: 'node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml' };
const fresh = '<manifest package="org.reactnative.maskedview" xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n';
const built = fresh.replace('package="org.reactnative.maskedview"', '');
test('fresh install and Gradle-rewritten manifest produce the same fingerprint input', () => {
  const expected = fileHookTransform(source, built, true);
  assert.equal(fileHookTransform(source, fresh, true), expected);
  for (const chunk of fresh) assert.equal(fileHookTransform(source, Buffer.from(chunk), false), null);
  assert.equal(fileHookTransform(source, null, true), expected);
});
test('preserves meaningful manifest changes and other files', () => {
  assert.notEqual(fileHookTransform(source, fresh.replace('</manifest>', '<uses-permission android:name="example"/></manifest>'), true), fileHookTransform(source, fresh, true));
  assert.equal(fileHookTransform({ type: 'file', filePath: 'other/AndroidManifest.xml' }, fresh, true), fresh);
});
