import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth-context';
import { canDriverInteract, registrationRoute } from '@/lib/driver-access';
import { nextStepToRoute } from '@/lib/onboarding-route';

export function useDriverAccess() {
  const { driver, refreshDriverMe } = useAuth();
  const router = useRouter();
  const continueRegistration = useCallback(async () => {
    try {
      const response = await refreshDriverMe();
      router.push(canDriverInteract(response.driver) ? '/receive-requests' :
        response.nextStep === 'HOME' ? registrationRoute(response.driver) : nextStepToRoute(response.nextStep));
    } catch {
      router.push(registrationRoute(driver));
    }
  }, [driver, refreshDriverMe, router]);
  return { canInteract: canDriverInteract(driver), continueRegistration };
}
