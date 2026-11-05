/* global __dirname */
// Fail closed when an upstream package changes; do not falsify package versions.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const lock = require(path.join(root, 'package-lock.json'));
const patches = require('./backports.json');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const pending = [];
for (const patch of patches) {
  const targets = Object.entries(lock.packages).filter(([p, entry]) =>
    p.endsWith('node_modules/' + patch.package) && entry.version === patch.version);
  if (!targets.length) throw new Error(`Review required: missing ${patch.package}@${patch.version}`);
  for (const [relative] of targets) {
    const file = path.join(root, relative, patch.file);
    let source = fs.readFileSync(file, 'utf8');
    if (hash(source) === patch.after) continue;
    if (hash(source) !== patch.before) throw new Error(`Review required: unexpected bytes in ${relative}/${patch.file}`);
    for (const [before, after] of patch.replacements) {
      if (source.split(before).length !== 2) throw new Error('Backport anchor mismatch');
      source = source.replace(before, after);
    }
    if (hash(source) !== patch.after) throw new Error('Backport result hash mismatch');
    pending.push({ file, source });
  }
}
for (const { file, source } of pending) {
  fs.writeFileSync(file + '.transpo24-backport', source);
  fs.renameSync(file + '.transpo24-backport', file);
}
console.log(`Security backports verified; ${pending.length} files patched. Advisory versions remain unchanged.`);
