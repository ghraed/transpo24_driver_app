// Validate an explicitly supplied, separate Firebase project before native prebuild.
function validateStagingFirebase(bytes, expectedPackage, forbiddenProjects) {
  const data = JSON.parse(bytes.toString('utf8'));
  const projectId = data?.project_info?.project_id;
  const projectNumber = data?.project_info?.project_number;
  const allowed = new Set(['com.transpo24.app.staging', 'com.transpo24.driver.staging']);
  const clients = Array.isArray(data?.client) ? data.client : [];
  const packages = clients.map(c => c.client_info?.android_client_info?.package_name);
  if (!allowed.has(expectedPackage) || typeof projectId !== 'string' || !projectId.trim() || !projectNumber || !Array.isArray(data?.client)) throw new Error('Incomplete staging Firebase configuration');
  if (forbiddenProjects.has(projectId)) throw new Error('Production/development Firebase project is forbidden for controlled staging');
  if (!packages.includes(expectedPackage) || packages.some(p => !allowed.has(p))) throw new Error('Firebase configuration must register the matching staging package and no production/development packages');
  const matching = clients.find(c => c.client_info?.android_client_info?.package_name === expectedPackage);
  if (!matching.client_info.mobilesdk_app_id?.startsWith(`1:${projectNumber}:android:`) || !matching.api_key?.some(k => typeof k.current_key === 'string' && k.current_key.startsWith('AIza'))) throw new Error('Incomplete staging Firebase client metadata');
  return { projectId, expectedPackage };
}
module.exports = { validateStagingFirebase };
