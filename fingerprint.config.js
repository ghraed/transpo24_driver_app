const { Buffer } = require('node:buffer');
const manifestPath = 'node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml';
const pending = new Map();

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  fileHookTransform(source, chunk, isEndOfFile) {
    if (source.type !== 'file' || source.filePath.replaceAll('\\', '/') !== manifestPath) return chunk;
    // masked-view 0.3.2 removes this legacy package attribute during Gradle
    // configuration. Its build.gradle namespace remains the authoritative value.
    // Normalize only that rewrite; retain all other native manifest changes.
    const chunks = pending.get(source.filePath) ?? [];
    if (chunk !== null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (!isEndOfFile) {
      pending.set(source.filePath, chunks);
      return null;
    }
    pending.delete(source.filePath);
    return Buffer.concat(chunks).toString('utf8')
      .replace(/<manifest\s+(?:package="org\.reactnative\.maskedview"\s+)?/, '<manifest ');
  },
};
