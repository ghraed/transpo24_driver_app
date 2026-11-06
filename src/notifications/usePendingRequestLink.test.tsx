import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { queueRequestLink, readPendingLink, setLinkOwner } from '@/lib/pending-request-link';
import { usePendingRequestLink } from './usePendingRequestLink';
const mockStorage = new Map<string, string>();
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockAuthorize = jest.fn<(...args: unknown[]) => Promise<unknown>>();
let mockNativeURL: string | null = null;
let mockReady = false;
let mockOwner = 'account-a';
let mockPath = '/';
jest.mock('expo-linking', () => ({ useLinkingURL: () => mockNativeURL }));
jest.mock('expo-secure-store', () => ({ getItemAsync: async (key: string) => mockStorage.get(key) ?? null, setItemAsync: async (key: string, value: string) => { mockStorage.set(key, value); }, deleteItemAsync: async (key: string) => { mockStorage.delete(key); } }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, usePathname: () => mockPath, useRootNavigationState: () => ({ key: 'root' }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: mockOwner }, accessToken: mockReady ? 'token' : null, isRestoringSession: !mockReady }) }));
jest.mock('@/lib/api', () => ({ getDriverRequestDetails: (...args: unknown[]) => mockAuthorize(...args), getDriverAcceptedJobDetails: (...args: unknown[]) => mockAuthorize(...args), getDriverChatRoom: (...args: unknown[]) => mockAuthorize(...args), getDriverChatRoomByTransportRequestId: (...args: unknown[]) => mockAuthorize(...args) }));
let tree: ReactTestRenderer;
function Probe({ consent = true }: { consent?: boolean }) { usePendingRequestLink(consent); return null; }
beforeEach(() => { mockStorage.clear(); mockNativeURL = null; setLinkOwner(null); jest.clearAllMocks(); mockAuthorize.mockResolvedValue({}); mockReady = false; mockOwner = 'account-a'; mockPath = '/'; });
afterEach(async () => { await act(async () => tree?.unmount()); });
test('cold request waits for authentication, consent and startup redirect before checking ownership and opening', async () => {
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  await act(async () => { tree = create(<Probe consent={false} />); });
  expect(mockAuthorize).not.toHaveBeenCalled();
  mockReady = true; mockPath = '/driver-home';
  await act(async () => tree.update(<Probe consent={false} />));
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => tree.update(<Probe />));
  expect(mockAuthorize).toHaveBeenCalledWith('owned-request');
  expect(mockPush).toHaveBeenCalledWith('/accepted-job-details?requestId=owned-request');
  expect(await readPendingLink()).toBeNull();
});
test('account switch during ownership lookup discards the old completion and destination', async () => {
  let finish!: (value: unknown) => void;
  mockAuthorize.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  mockReady = true; mockPath = '/driver-home';
  await act(async () => { tree = create(<Probe />); });
  expect((await readPendingLink())?.owner).toBe('account-a');
  mockOwner = 'account-b';
  await act(async () => tree.update(<Probe />));
  await act(async () => finish({}));
  expect(mockPush).not.toHaveBeenCalled();
  expect(await readPendingLink()).toBeNull();
});
test('failed ownership/network lookup cannot expose a private destination', async () => {
  mockAuthorize.mockRejectedValueOnce(new Error('Unavailable'));
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  mockReady = true; mockPath = '/driver-home';
  await act(async () => { tree = create(<Probe />); });
  expect(mockPush).not.toHaveBeenCalled();
  expect((await readPendingLink())?.owner).toBe('account-a');
});

test('recovers the native launch cache when Android Router supplied only its root fallback', async () => {
  mockNativeURL = 'transpo24-driver-dev://accepted-job-details?requestId=native-cache-owned';
  await act(async () => { tree = create(<Probe />); });
  expect(mockPush).not.toHaveBeenCalled();
  mockReady = true; mockPath = '/home';
  await act(async () => tree.update(<Probe />));
  expect(mockAuthorize).toHaveBeenCalledWith('native-cache-owned');
  expect(mockPush).toHaveBeenCalledWith('/accepted-job-details?requestId=native-cache-owned');
  expect(await readPendingLink()).toBeNull();
  await act(async () => tree.unmount());
  await act(async () => { tree = create(<Probe />); });
  expect(mockPush).toHaveBeenCalledTimes(1);
});
