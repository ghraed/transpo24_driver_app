import { useLinkingURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { getDriverRequestDetails, getDriverAcceptedJobDetails, getDriverChatRoom, getDriverChatRoomByTransportRequestId } from '@/lib/api';
import { recoverNativeRequestLink, claimPendingLink, clearPendingLink, pendingLinkRevision, readPendingLink, setLinkOwner, subscribePendingLink } from '@/lib/pending-request-link';

export async function authorizeRequestLink(route: string): Promise<void> {
  const url = new URL(route, 'https://local');
  const id = url.searchParams.get('requestId') || url.searchParams.get('tripId');
  if (url.pathname === '/chat') {
    const roomId = url.searchParams.get('chatRoomId');
    if (roomId) await getDriverChatRoom(roomId);
    else await getDriverChatRoomByTransportRequestId(url.searchParams.get('transportRequestId')!);
  } else if (url.pathname === '/review-request-details') {
    await getDriverRequestDetails(id!);
  } else await getDriverAcceptedJobDetails(id!);
}

// Mounted inside the consent boundary: no private destination loads before consent.
export function usePendingRequestLink(enabled: boolean) {
  const auth = useAuth();
  const owner = auth.user?.id ?? null;
  const ready = enabled && !auth.isRestoringSession && Boolean(auth.accessToken && owner);
  const nativeURL = useLinkingURL();
  const router = useRouter();
  const pathname = usePathname();
  const state = useRootNavigationState();
  const [incoming, setIncoming] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') setIncoming(value => value + 1);
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => subscribePendingLink(() => setIncoming(value => value + 1)), []);
  useEffect(() => { setLinkOwner(owner); return () => setLinkOwner(null); }, [owner]);
  useEffect(() => {
    void recoverNativeRequestLink(nativeURL).catch(() => { /* Retain the login route when storage is unavailable. */ });
  }, [nativeURL]);
  useEffect(() => {
    if (!ready || !state?.key || ['/', '/register', '/verify-phone', '/complete-profile'].includes(pathname)) return;
    let active = true;
    const revision = pendingLinkRevision();
    void (async () => {
      const link = await readPendingLink();
      if (!active || !link || revision !== pendingLinkRevision()) return;
      if (link.owner && link.owner !== owner) { await clearPendingLink(revision); return; }
      if (!await claimPendingLink(link, owner!, revision) || !active) return;
      try {
        await authorizeRequestLink(link.route);
        if (!active || revision !== pendingLinkRevision()) return;
        await clearPendingLink(revision);
        if (active && revision === pendingLinkRevision()) router.push(link.route as Href);
      } catch {
        // Retain the destination on network failures. Retry after navigation/restart;
        // backend ownership checks must succeed before any private screen is opened.
      }
    })().catch(() => { /* Unavailable secure storage cannot authorize navigation. */ });
    return () => { active = false; };
  }, [ready, owner, state?.key, pathname, incoming, router]);
}
