/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '../src/localization/locales');
function flatten(value, prefix = '', out = {}) {
  for (const [key, item] of Object.entries(value)) {
    const full = prefix ? prefix + '.' + key : key;
    if (typeof item === 'string') out[full] = item;
    else if (item && typeof item === 'object') flatten(item, full, out);
    else throw new Error(`Invalid catalog value ${full}`);
  }
  return out;
}
const read = (name) => flatten(JSON.parse(fs.readFileSync(path.join(root, name + '.json'), 'utf8')));
const source = read('en');
const placeholders = text => (text.match(/\{\{[^{}]+\}\}|(?<!\{)\{[^{}]+\}(?!\})/g) || []).sort();
for (const locale of ['en','ar','de','es','fr','it']) {
  const target = read(locale); const missing = []; const mismatched = [];
  for (const [key,value] of Object.entries(source)) {
    if (!target[key]?.trim()) { missing.push(key); continue; }
    if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(target[key]))) mismatched.push(key);
  }
  console.log(JSON.stringify({ locale, sourceLeaves: Object.keys(source).length, translatedLeaves: Object.keys(target).length, missing: missing.length, placeholderMismatches: mismatched.length, legacyExtraKeys: Object.keys(target).filter(k=>!(k in source)).length }));
  assert.deepEqual(missing, [], `${locale} missing keys`); assert.deepEqual(mismatched, [], `${locale} lost placeholders`);
}
console.log('PASS automated structure only. Human translation, contextual meaning, truncation, RTL and accessibility review remain required.');
// Check literal keys in real source as well as catalog-to-catalog parity. This
// catches keys absent from English that otherwise fall back in every language.
const ts = require('typescript');
const missingSourceKeys = new Map();
function inspectKey(node, file) {
  if (ts.isStringLiteralLike(node) && !(node.text in source)) missingSourceKeys.set(node.text, file);
  else if (ts.isConditionalExpression(node)) { inspectKey(node.whenTrue, file); inspectKey(node.whenFalse, file); }
}
function inspectDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspectDirectory(file); continue; }
    if (!/\.[jt]sx?$/.test(file) || /(?:test|spec)\.[jt]sx?$/.test(file)) continue;
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments[0] &&
          ((ts.isIdentifier(node.expression) && node.expression.text === 't') ||
           (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'))) inspectKey(node.arguments[0], path.relative(path.join(__dirname, '..'), file));
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
inspectDirectory(path.join(__dirname, '../src'));
assert.deepEqual([...missingSourceKeys], [], 'Literal source keys missing from English');
console.log('PASS source literal/conditional translation key coverage. Dynamically constructed keys and linguistic quality still require review.');
