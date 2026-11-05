const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
require('./apply-backports.cjs');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const zodRoot = path.dirname(cliRequire.resolve('zod/package.json'));
async function check(z) {
  let visits = 0;
  const item = z.string().superRefine(() => { visits++; });
  for (const schema of [z.array(item).max(2), z.array(item).length(2)]) {
    visits = 0;
    assert.equal(schema.safeParse(Array(100000).fill('x')).success, false);
    assert.equal(visits, 0);
    assert.equal((await schema.safeParseAsync(Array(100000).fill('x'))).success, false);
    assert.equal(visits, 0);
    assert.deepEqual(schema.parse(['a', 'b']), ['a', 'b']);
    assert.equal(schema.safeParse([123]).success, false);
  }
  visits = 0;
  const set = z.set(item).max(2);
  assert.equal(set.safeParse(new Set(['a','b','c'])).success, false);
  assert.equal((await set.safeParseAsync(new Set(['a','b','c']))).success, false);
  assert.equal(visits, 0);
  assert.deepEqual([...set.parse(new Set(['a','b']))], ['a','b']);
  assert.deepEqual(z.object({ name: z.string(), list: z.array(z.number()) }).parse({ name: 'sdk56', list: [1,2] }), { name: 'sdk56', list: [1,2] });
}
(async () => {
  await check(cliRequire('zod'));
  await check(await import(pathToFileURL(path.join(zodRoot, 'v3/index.js')).href));
  // A subprocess timeout detects regressions without hanging the verifier itself.
  const image = require.resolve('image-size');
  const probe = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const size = require(${JSON.stringify(image)});
    const utils = require(${JSON.stringify(path.join(path.dirname(image), 'types/utils.js'))});
    const { JXL } = require(${JSON.stringify(path.join(path.dirname(image), 'types/jxl.js'))});
    const { HEIF } = require(${JSON.stringify(path.join(path.dirname(image), 'types/heif.js'))});
    for (const length of [0,1,7,100]) {
      const bad=Buffer.alloc(16); bad.write('icns'); bad.writeUInt32BE(16,4); bad.write('junk',8);bad.writeUInt32BE(length,12);
      assert.throws(()=>size(bad));
    }
    const zero=Buffer.alloc(16); zero.write('jxlp',4);
    assert.equal(utils.findBox(zero,'meta',0),undefined);
    assert.throws(()=>JXL.calculate(zero));
    assert.throws(()=>HEIF.calculate(zero));
    const good=Buffer.alloc(16);good.write('icns');good.writeUInt32BE(16,4);good.write('icp4',8);good.writeUInt32BE(8,12);
    assert.equal(size(good).width,16);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
    assert.equal(size(png).width,1);
  `], { timeout: 3000, encoding: 'utf8' });
  assert.equal(probe.error, undefined);
  assert.equal(probe.status, 0, probe.stderr);
  const root = path.resolve(require.resolve('../../package.json'), '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'transpo24-backport-check-'));
  try {
    const lock = require('../../package-lock.json');
    const patches = require('./backports.json');
    fs.mkdirSync(path.join(temp, 'scripts/security'), { recursive: true });
    fs.copyFileSync(require.resolve('./apply-backports.cjs'), path.join(temp,'scripts/security/apply-backports.cjs'));
    fs.copyFileSync(require.resolve('./backports.json'), path.join(temp,'scripts/security/backports.json'));
    fs.writeFileSync(path.join(temp,'package-lock.json'), JSON.stringify(lock));
    let first;
    for(const patch of patches) for(const [directory, entry] of Object.entries(lock.packages)) {
      if(!directory.endsWith('node_modules/' + patch.package) || entry.version !== patch.version) continue;
      const relative = path.join(directory,patch.file); const target = path.join(temp,relative);
      let original = fs.readFileSync(path.join(root,relative),'utf8');
      for(const [before,after] of [...patch.replacements].reverse()) original = original.replace(after,before);
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,original);first ||= target;
    }
    const apply = () => spawnSync(process.execPath,[path.join(temp,'scripts/security/apply-backports.cjs')],{encoding:'utf8',timeout:3000});
    assert.equal(apply().status,0,'pristine install backport');
    assert.equal(apply().status,0,'idempotent backport');
    fs.appendFileSync(first,'\n// unexpected upstream bytes\n');
    const rejected = apply();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Review required/);
    console.log('PASS: pristine-byte replay, idempotent install, and unexpected-source fail-closed rejection.');
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
  console.log('PASS: CJS/ESM Zod3 bounded-array/set sync+async; image-size malformed ICNS/JXL/HEIF termination and valid PNG/ICNS. Unbounded Zod remains open.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
