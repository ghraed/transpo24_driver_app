import { useEffect } from 'react';
import { AppState } from 'react-native';
import { syncRequestMatchingLocation } from '@/location/request-matching-location';

export function useRequestMatchingLocation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void syncRequestMatchingLocation().catch(() => { /* Existing fixes expire on the server; base coverage remains available. */ }); };
    refresh();
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [enabled]);
}
