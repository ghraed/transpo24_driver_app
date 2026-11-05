const { Buffer } = require('node:buffer');
const { validateStagingFirebase } = require('./staging-firebase-config.cjs');
const expected = 'com.transpo24.app.staging';
const sample = (packages = [expected], project = 'synthetic-staging') => Buffer.from(JSON.stringify({ project_info: { project_id: project, project_number: '123' }, client: packages.map(package_name => ({ client_info: { mobilesdk_app_id: '1:123:android:fixture', android_client_info: { package_name } }, api_key: [{ current_key: 'AIza' + 'X'.repeat(35) }] })) }));
const forbidden = new Set(['synthetic-production']);
test('accepts separate staging clients and returns only public metadata', () => {
 expect(validateStagingFirebase(sample([expected, 'com.transpo24.driver.staging']), expected, forbidden)).toEqual({ projectId: 'synthetic-staging', expectedPackage: expected });
});
test('rejects a matching package on the production Firebase project', () => {
 expect(() => validateStagingFirebase(sample([expected], 'synthetic-production'), expected, forbidden)).toThrow('forbidden');
});
test('rejects wrong-stage or mixed production/development clients', () => {
 for (const packages of [['com.transpo24.driver.staging'], [expected, 'com.transpo24.app'], [expected, 'com.transpo24.app.dev']]) expect(() => validateStagingFirebase(sample(packages), expected, forbidden)).toThrow('matching staging package');
});
test('rejects missing Firebase client metadata', () => {
 expect(() => validateStagingFirebase(Buffer.from(JSON.stringify({ project_info: { project_id: 'synthetic-staging' }, client: [] })), expected, forbidden)).toThrow('Incomplete');
});
