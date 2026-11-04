import { jest, test, expect } from '@jest/globals';
import { privateAssetSource } from './private-asset';
jest.mock('./auth-storage', () => ({ getCurrentAccessToken: () => 'synthetic-token' }));
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'https://api.example.test' }));
test('protects same-origin legacy private images', () => {
 expect(privateAssetSource('/uploads/private.png')).toMatchObject({ uri: 'https://api.example.test/uploads/private.png', headers: { Authorization: 'Bearer synthetic-token' } });
});
test.each(['https://other.example/uploads/a.png', 'file:///cache/photo.png', 'https://api.example.test.evil/uploads/a.png'])('never leaks credentials to %s', uri => {
 expect(privateAssetSource(uri)).toEqual({ uri });
});
