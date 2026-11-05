import { assertPushBackend } from './assertPushBackend';

const response = (config, ok = true) => jest.fn().mockResolvedValue({ ok, json: async () => config });
test.each(['com.transpo24.app', 'com.transpo24.driver'])('isolates both builds of %s', async (id) => {
  const dev = response({ environment: 'DEVELOPMENT', applicationIds: [id + '.dev'] });
  const prod = response({ environment: 'PRODUCTION', applicationIds: [id] });
  await expect(assertPushBackend('https://api.example', id + '.dev', dev)).resolves.toBeUndefined();
  await expect(assertPushBackend('https://api.example', id, prod)).resolves.toBeUndefined();
  await expect(assertPushBackend('https://api.example', id, dev)).rejects.toThrow('do not match');
  await expect(assertPushBackend('https://api.example', id + '.dev', prod)).rejects.toThrow('do not match');
});
test('blocks servers without isolation support and unknown app IDs', async () => {
  await expect(assertPushBackend('https://api.example', 'com.transpo24.app.dev', response({}, false))).rejects.toThrow('does not support');
  await expect(assertPushBackend('https://api.example', 'unknown.dev', response({ environment: 'DEVELOPMENT', applicationIds: [] }))).rejects.toThrow('do not match');
});

test.each(['com.transpo24.app', 'com.transpo24.driver'])('isolates staging push for %s', async (id) => {
  const staging = response({ environment: 'STAGING', applicationIds: [id + '.staging'] });
  await expect(assertPushBackend('http://127.0.0.1', id + '.staging', staging)).resolves.toBeUndefined();
  for (const other of [id, id + '.dev']) {
    await expect(assertPushBackend('http://127.0.0.1', other, staging)).rejects.toThrow('do not match');
  }
  for (const environment of ['DEVELOPMENT', 'PRODUCTION']) {
    await expect(assertPushBackend('http://127.0.0.1', id + '.staging', response({ environment, applicationIds: [id + '.staging'] }))).rejects.toThrow('do not match');
  }
});
