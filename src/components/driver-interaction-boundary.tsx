import { subscribeDriverApprovalRequired } from '@/lib/driver-approval-events';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { canDriverInteract, registrationRoute, requiresDriverApproval } from '@/lib/driver-access';
import { nextStepToRoute } from '@/lib/onboarding-route';

// Keep the navigator mounted while preventing touches during approval checks.
export function DriverInteractionBoundary({ children }: { children: React.ReactNode }) {
  const { accessToken, driver, refreshDriverMe } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);
  const protectedRoute = requiresDriverApproval(pathname);
  const blocked = protectedRoute && (!canDriverInteract(driver) || verifiedPath !== pathname);

  useEffect(() => {
    let active = true;
    let checking = false;
    const checkApproval = async () => {
      if (checking) return;
      if (!accessToken) { router.replace('/'); return; }
      checking = true;
      try {
        const response = await refreshDriverMe();
        if (!active) return;
        if (canDriverInteract(response.driver)) setVerifiedPath(pathname);
        else router.replace(response.nextStep === 'HOME' ? registrationRoute(response.driver) : nextStepToRoute(response.nextStep));
      } catch {
        if (active) router.replace('/receive-requests');
      } finally { checking = false; }
    };
    const unsubscribe = subscribeDriverApprovalRequired(() => {
      setVerifiedPath(null);
      void checkApproval();
    });
    if (protectedRoute) void checkApproval();
    return () => { active = false; unsubscribe(); setVerifiedPath(null); };
  }, [accessToken, pathname, protectedRoute, refreshDriverMe, router]);

  return <View style={styles.container}>
    <View style={[styles.container, blocked && styles.hidden]} pointerEvents={blocked ? 'none' : 'auto'} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>{children}</View>
    {blocked ? <View style={styles.loading}><ActivityIndicator size="large" /></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, hidden: { opacity: 0 },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
});
