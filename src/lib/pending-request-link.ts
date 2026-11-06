import * as SecureStore from 'expo-secure-store';

export type PendingLink = { route: string; owner: string | null; createdAt: number };
const key = 'transpo24.pending-request-link';
const listeners = new Set<() => void>();
let owner: string | null = null;
let revision = 0;
const capturedNativeRoutes = new Set<string>();
// Serialize storage changes so a late removal cannot erase a newer incoming link.
let writes: Promise<unknown> = Promise.resolve();
const write = (fn: () => Promise<unknown>) => { writes = writes.catch(() => undefined).then(fn); return writes; };
export function setLinkOwner(value: string | null) { owner = value; }
export function subscribePendingLink(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function normalizeRequestLink(path: string): string | null {
  try {
    const url = new URL(path, 'transpo24://local');
    if (!['transpo24:', 'transpo24-dev:', 'transpo24-staging:',
      'transpo24-driver:', 'transpo24-driver-dev:', 'transpo24-driver-staging:'].includes(url.protocol)) return null;
    const pathname = url.hostname && url.hostname !== 'local'
      ? '/' + url.hostname + url.pathname : url.pathname;
    const route = pathname.replace(/^\/--\//, '/').replace(/\/$/, '');
    const fields: Record<string, string[]> = {"/review-request-details": ["requestId"], "/accepted-job-details": ["requestId"], "/driver-trip-completed": ["tripId"], "/chat": ["chatRoomId", "transportRequestId"]};
    const allowed = fields[route];
    if (!allowed) return null;
    const params = new URLSearchParams();
    for (const field of allowed) {
      const value = url.searchParams.get(field)?.trim();
      if (value && /^[A-Za-z0-9_-]{1,128}$/.test(value)) params.set(field, value);
    }
    if (![...params.keys()].length) return null;
    // Never accept serialized request/payment data or an arbitrary return URL.
    return route + '?' + params.toString();
  } catch { return null; }
}
export async function queueRequestLink(path: string): Promise<boolean> {
  const route = normalizeRequestLink(path);
  if (!route) return false;
  capturedNativeRoutes.add(route);
  if (capturedNativeRoutes.size > 64) capturedNativeRoutes.delete(capturedNativeRoutes.values().next().value!);
  const link: PendingLink = { route, owner, createdAt: Date.now() };
  revision++;
  await write(() => SecureStore.setItemAsync(key, JSON.stringify(link)));
  listeners.forEach(fn => fn());
  return true;
}
export async function readPendingLink(): Promise<PendingLink | null> {
  await writes;
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    const link = JSON.parse(raw) as PendingLink;
    if (typeof link.createdAt !== 'number' || Date.now() - link.createdAt > 86400000 ||
        link.createdAt > Date.now() || (link.owner !== null && typeof link.owner !== 'string') ||
        normalizeRequestLink(link.route) !== link.route) return null;
    return link;
  } catch { return null; }
}
export function pendingLinkRevision() { return revision; }
export async function clearPendingLink(expectedRevision: number) {
  await write(async () => {
    if (revision === expectedRevision) await SecureStore.deleteItemAsync(key);
  });
}

export async function claimPendingLink(link: PendingLink, account: string, expectedRevision: number): Promise<boolean> {
  let claimed = false;
  await write(async () => {
    if (revision !== expectedRevision || (link.owner && link.owner !== account)) return;
    await SecureStore.setItemAsync(key, JSON.stringify({ ...link, owner: account }));
    claimed = true;
  });
  return claimed;
}

// Android Router may time out React Native's initial-URL lookup while Expo's
// native lifecycle cache still retains the launch intent. Recover that cache
// without replaying an intent already handled by +native-intent.
export async function recoverNativeRequestLink(path: string | null): Promise<boolean> {
  if (!path) return false;
  const route = normalizeRequestLink(path);
  if (!route || capturedNativeRoutes.has(route)) return false;
  return queueRequestLink(route);
}
