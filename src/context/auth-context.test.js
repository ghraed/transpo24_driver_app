import React from 'react';
import { act, create } from 'react-test-renderer';
import { AuthProvider, useAuth } from './auth-context';
import * as api from '@/lib/api';
let mockToken = null;
jest.mock('@/config/backend', () => ({ getBackendApiBaseUrl: () => 'http://isolated.test' }));
jest.mock('@/location/background-trip-tracking', () => ({ stopBackgroundTripTracking: jest.fn(async () => {}) }));
jest.mock('@/lib/auth-storage', () => ({
 readAccessToken: jest.fn(async () => mockToken),
 persistAccessToken: jest.fn(async t => { mockToken = t; }),
 clearAccessToken: jest.fn(async () => { mockToken = null; }),
 persistTrustedDriverSession: jest.fn(async () => {}), readTrustedDriverSession: jest.fn(async () => null),
 clearTrustedDriverSession: jest.fn(async () => {}), clearDriverOnboardingDrafts: jest.fn(async () => {}),
}));
jest.mock('@/lib/api', () => ({ getDriverMe: jest.fn(), verifyDriverPhoneVerificationCode: jest.fn(), updateDriverProfile: jest.fn(), isAuthenticationFailure: () => false }));
const response = id => ({ accessToken: 'token-' + id, user: { id, role: 'DRIVER' }, driver: { id: 'profile-' + id, phone: '+12025550111' }, nextStep: 'HOME' });
let current;
function Probe() { const auth = useAuth(); React.useEffect(() => { current = auth; }, [auth]); return null; }
beforeEach(() => { jest.clearAllMocks(); mockToken = null; Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: jest.fn(async () => ({ ok: true })) }); });
it.each(['refreshDriverMe', 'saveDriverProfile'])('discards %s completed after logout and another synthetic login', async method => {
 let tree;
 await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
 await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
 api.verifyDriverPhoneVerificationCode.mockResolvedValueOnce(response('a'));
 await act(async () => { await current.authenticateWithPhone({}); });
 let release;
 (method === 'refreshDriverMe' ? api.getDriverMe : api.updateDriverProfile).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
 let pending;
 await act(async () => { pending = current[method]({}).catch(error => error); });
 await act(async () => { await current.signOut(); });
 api.verifyDriverPhoneVerificationCode.mockResolvedValueOnce(response('b'));
 await act(async () => { await current.authenticateWithPhone({}); });
 await act(async () => { release(response('a')); await pending; });
 expect(current.user.id).toBe('b');
 expect(await pending).toBeInstanceOf(Error);
 await act(async () => tree.unmount());
});
