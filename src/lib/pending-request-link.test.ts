import { beforeEach, expect, jest, test } from '@jest/globals';
import { claimPendingLink, clearPendingLink, normalizeRequestLink, pendingLinkRevision, queueRequestLink, readPendingLink, setLinkOwner } from './pending-request-link';
const mockStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({ getItemAsync: async (key: string) => mockStorage.get(key) ?? null, setItemAsync: async (key: string, value: string) => { mockStorage.set(key, value); }, deleteItemAsync: async (key: string) => { mockStorage.delete(key); } }));
beforeEach(() => { mockStorage.clear(); setLinkOwner(null); });
test('normalizes cold custom-scheme request paths and discards untrusted serialized payloads', () => {
  expect(normalizeRequestLink('transpo24-driver-staging://accepted-job-details?requestId=owned-request&request=untrusted')).toBe('/accepted-job-details?requestId=owned-request');
  expect(normalizeRequestLink('https://untrusted.example/request-status?requestId=x')).toBeNull();
  expect(normalizeRequestLink('/unknown?requestId=x')).toBeNull();
  expect(normalizeRequestLink('evil://chat?chatRoomId=x')).toBeNull();
  expect(normalizeRequestLink('/chat?chatRoomId=')).toBeNull();
});
test('retains a logged-out destination until authentication, and binds it to the consuming identity', async () => {
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  const link = (await readPendingLink())!;
  expect(link.owner).toBeNull();
  const revision = pendingLinkRevision();
  expect(await claimPendingLink(link, 'account-a', revision)).toBe(true);
  const claimed = (await readPendingLink())!;
  expect(claimed.owner).toBe('account-a');
  expect(await claimPendingLink(claimed, 'account-b', revision)).toBe(false);
});
test('an old asynchronous completion cannot clear or claim a newer incoming link', async () => {
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  const old = (await readPendingLink())!;
  const revision = pendingLinkRevision();
  await queueRequestLink('/chat?chatRoomId=new-room');
  await clearPendingLink(revision);
  expect(await claimPendingLink(old, 'account-a', revision)).toBe(false);
  expect((await readPendingLink())?.route).toBe('/chat?chatRoomId=new-room');
});
test('links captured while authenticated retain that owner across account switches', async () => {
  setLinkOwner('account-a');
  await queueRequestLink('/accepted-job-details?requestId=owned-request');
  setLinkOwner('account-b');
  expect((await readPendingLink())?.owner).toBe('account-a');
});
