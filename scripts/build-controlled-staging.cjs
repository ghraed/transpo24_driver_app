/* global __dirname */
// Local APK only. Never invokes EAS, publishing, OTA, upload or store signing.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { parseEnv } = require('node:util');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const name = path.basename(root);
if (!['client_mobile','driver_mobile'].includes(name)) throw new Error('Unknown repository');
let reuse; let firebaseInput;
for (let i=2; i<process.argv.length; i++) {
 if (process.argv[i]==='--refresh-js' && process.argv[i+1]) reuse=process.argv[++i];
 else if (process.argv[i]==='--firebase-config' && process.argv[i+1]) firebaseInput=process.argv[++i];
 else throw new Error('Use --refresh-js <isolated source> or --firebase-config <staging-only file>');
}
if(reuse && firebaseInput) throw new Error('Firebase changes require a fresh native build');
let firebaseMetadata; let firebaseBytes;
if(firebaseInput) {
 const forbiddenProjects=new Set();
 for(const file of ['google-services.json','google-services.dev.json']) {
  const full=path.join(root,file);if(fs.existsSync(full))forbiddenProjects.add(JSON.parse(fs.readFileSync(full,'utf8')).project_info?.project_id);
 }
 firebaseBytes=fs.readFileSync(path.resolve(firebaseInput));
 firebaseMetadata=require('./staging-firebase-config.cjs').validateStagingFirebase(firebaseBytes,
  name==='client_mobile'?'com.transpo24.app.staging':'com.transpo24.driver.staging',forbiddenProjects);
}
if(reuse && fs.existsSync(path.join(reuse,'android/app/google-services.json'))) {
 // A JS-only refresh may retain an already-built, unchanged staging Firebase input.
 // It must match both the private input and the successful artifact's recorded hash.
 const previous=JSON.parse(fs.readFileSync(path.join(path.dirname(path.resolve(reuse)),'artifact.json'),'utf8'));
 firebaseBytes=fs.readFileSync(path.join(reuse,'android/app/google-services.json'));
 const retained=fs.readFileSync(path.join(path.dirname(path.resolve(reuse)),'staging-google-services.json'));
 if(previous.source!==path.resolve(reuse) || !previous.firebase || !firebaseBytes.equals(retained) ||
    previous.firebaseConfigSha256!==crypto.createHash('sha256').update(firebaseBytes).digest('hex')) {
  throw new Error('Firebase native inputs changed; use a fresh build');
 }
 const forbiddenProjects=new Set();
 for(const file of ['google-services.json','google-services.dev.json']) {
  const full=path.join(root,file);if(fs.existsSync(full))forbiddenProjects.add(JSON.parse(fs.readFileSync(full,'utf8')).project_info?.project_id);
 }
 firebaseMetadata=require('./staging-firebase-config.cjs').validateStagingFirebase(firebaseBytes,
  name==='client_mobile'?'com.transpo24.app.staging':'com.transpo24.driver.staging',forbiddenProjects);
}
if (reuse && (!path.resolve(reuse).startsWith('/tmp/transpo24-staging-' + name + '-') || path.basename(reuse) !== 'source')) throw new Error('Invalid isolated build path');
const workspace = reuse ? path.dirname(path.resolve(reuse)) : fs.mkdtempSync('/tmp/transpo24-staging-' + name + '-');
const source = path.join(workspace,'source');
const firebaseCopy=path.join(workspace,'staging-google-services.json');
if(firebaseBytes)fs.writeFileSync(firebaseCopy,firebaseBytes,{mode:0o600});
if (reuse) for (const file of ['app.json','app.config.ts','package.json','package-lock.json']) {
 if (!fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(source,file)))) throw new Error('Native inputs changed; use a fresh build: ' + file);
}
const omit = new Set(['node_modules','.git','.expo','android','ios','dist','coverage','.staging-local','.staging-artifacts']);
fs.cpSync(root, source, { recursive:true, filter:(file) => {
  const relative=path.relative(root,file); const parts=relative.split(path.sep);
  return !parts.some(p=>omit.has(p)) && !parts.some(p=>p.startsWith('.env')) && !file.endsWith('.log');
} });
if (!reuse) fs.symlinkSync(path.join(root,'node_modules'), path.join(source,'node_modules'), 'dir');
let pk='';
if(name==='client_mobile') for(const file of ['.env','.env.local','.env.stripe-production.local']) {
  if(!fs.existsSync(path.join(root,file))) continue;
  const values=parseEnv(fs.readFileSync(path.join(root,file),'utf8'));
  for(const key of ['EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY','EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY']) if(values[key]?.startsWith('pk_test_')) pk=values[key];
}
if(name==='client_mobile' && !pk) throw new Error('A Stripe TEST publishable key is required');
const env={ PATH:process.env.PATH, JAVA_HOME:process.env.JAVA_HOME, ANDROID_HOME:'/home/raed/Android/Sdk', ANDROID_SDK_ROOT:'/home/raed/Android/Sdk',
 APP_VARIANT:'staging', EXPO_NO_DOTENV:'1', NODE_ENV:'production', CI:'1', EXPO_PUBLIC_APP_ENV:'staging',
 EXPO_PUBLIC_API_URL:'http://127.0.0.1:57431', EXPO_PUBLIC_ANDROID_API_URL:'http://127.0.0.1:57431', EXPO_PUBLIC_SOCKET_URL:'http://127.0.0.1:57431', EXPO_PUBLIC_ANDROID_SOCKET_URL:'http://127.0.0.1:57431',
 EXPO_PUBLIC_STRIPE_MODE:'test', EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY:pk, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:pk,
 ...(firebaseMetadata?{EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE:firebaseCopy}:{}),
 CMAKE_BUILD_PARALLEL_LEVEL:'1', GRADLE_OPTS:'-Dorg.gradle.parallel=false' };
function run(command,args,cwd=source) {
 const result=cp.spawnSync(command,args,{cwd,env,stdio:'inherit'});
 if(result.error || result.status!==0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.status}`);
}
if (!reuse) run(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'prebuild','--platform','android','--no-install','--clean']);
const native=path.join(source,'android/app/src/main');
if (!reuse) {
const manifest=path.join(native,'AndroidManifest.xml');let text=fs.readFileSync(manifest,'utf8');
text=text.replace('<application ','<application android:networkSecurityConfig="@xml/staging_network_security_config" ');
text=text.replace(/android:usesCleartextTraffic="[^"]*"/g,'android:usesCleartextTraffic="true"');
fs.writeFileSync(manifest,text);
fs.mkdirSync(path.join(native,'res/xml'),{recursive:true});
fs.writeFileSync(path.join(native,'res/xml/staging_network_security_config.xml'),'<network-security-config><base-config cleartextTrafficPermitted="false"/><domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">127.0.0.1</domain></domain-config></network-security-config>');
}
const init=path.join(workspace,'staging.gradle');
fs.writeFileSync(init,`gradle.beforeProject { p ->
 ['com.android.application','com.android.library'].each { plugin ->
   p.plugins.withId(plugin) { p.androidComponents.finalizeDsl { android ->
     android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_JOB_POOLS=staging_compile=1', '-DCMAKE_JOB_POOL_COMPILE=staging_compile', '-DCMAKE_JOB_POOL_LINK=staging_compile'
   } }
 }
}\n`);
console.log('Controlled staging source:',source,'; loopback API; no Maps; FCM native config: '+Boolean(firebaseMetadata)+'; OTA disabled; local test signing only.');
run('./gradlew',[':app:assembleRelease','--no-daemon','--max-workers=1','--console=plain','-PreactNativeArchitectures=arm64-v8a','-Dorg.gradle.parallel=false','-I',init],path.join(source,'android'));
const built=path.join(source,'android/app/build/outputs/apk/release/app-release.apk');
const target=path.join(workspace,name+'-staging.apk');fs.copyFileSync(built,target);
const inputs=[];
function walk(dir) { for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) { const file=path.join(dir,entry.name); if(entry.isDirectory()) walk(file); else if(entry.isFile()) inputs.push({file:path.relative(source,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}); } }
walk(path.join(source,'src'));
for(const file of ['app.json','app.config.ts','package.json','package-lock.json','scripts/build-controlled-staging.cjs','scripts/staging-firebase-config.cjs']) inputs.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')});
fs.writeFileSync(path.join(workspace,'source-manifest.json'),JSON.stringify(inputs,null,2)+'\n');
const metadata={ sourceHash:crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex'), repository:name,apk:target,sha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),api:'http://127.0.0.1:57431',maps:false,firebase:Boolean(firebaseMetadata),firebaseProjectId:firebaseMetadata?.projectId || null,firebaseConfigSha256:firebaseBytes?crypto.createHash('sha256').update(firebaseBytes).digest('hex'):null,ota:false,storeArtifact:false,source:source };
fs.writeFileSync(path.join(workspace,'artifact.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata,null,2));
