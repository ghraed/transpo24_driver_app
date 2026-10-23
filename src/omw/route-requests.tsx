import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DriverButton, DriverNotice, DriverStatus } from '@/components/ui/driver-ui';
import { MapRequestMarker } from '@/components/map-request-marker';
import { useDriverAccess } from '@/hooks/use-driver-access';
import { getDriverRouteRequests } from '@/lib/api';
import type { DriverRequestAlertSummary } from '@/types/auth';
import { driverSpace, useDriverColors } from '@/theme/driver-theme';
import type { OmwRoute } from './routes';

export function OmwRouteRequests({ route, alternatives, radiusKm, children, enabled = true }: { route: OmwRoute; alternatives?: OmwRoute[]; radiusKm: number; enabled?: boolean; children?: (markers: React.ReactNode) => React.ReactNode }) {
  const { t } = useTranslation();
  const colors = useDriverColors();
  const router = useRouter();
  const { canInteract } = useDriverAccess();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const viewDetails = (requestId: string) => {
    router.push({ pathname: '/review-request-details', params: { requestId } });
  };
  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    setAlerts([]); setLoading(canInteract && enabled); setError(false);
    const load = async () => {
      if (pending || !canInteract || !enabled) return;
      pending = true;
      try {
        const candidates = alternatives?.length ? alternatives : [route];
        const results = await Promise.all(candidates.map(candidate => getDriverRouteRequests(candidate.coordinates, radiusKm)));
        const unique = new Map<string, DriverRequestAlertSummary>();
        for (const result of results) for (const alert of result.alerts) {
          const previous = unique.get(alert.requestId);
          if (!previous || (alert.distanceKm ?? Infinity) < (previous.distanceKm ?? Infinity)) unique.set(alert.requestId, alert);
        }
        if (active) { setAlerts([...unique.values()]); setError(false); }
      } catch {
        if (active) { setAlerts([]); setError(true); }
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => { active = false; clearInterval(timer); };
  // The retry counter intentionally restarts this focused search.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInteract, enabled, route.coordinates, alternatives, radiusKm, reload]));

  const markers = canInteract ? alerts.filter(alert => typeof alert.pickup.latitude === 'number' && typeof alert.pickup.longitude === 'number').map(alert => (
    <MapRequestMarker key={alert.requestId} coordinate={{ latitude: alert.pickup.latitude!, longitude: alert.pickup.longitude! }}
      serviceKey={alert.service?.key} itemType={alert.item?.type}
      title={alert.item?.title || t('Transport Request')}
      onPress={(event) => { event.stopPropagation(); viewDetails(alert.requestId); }} />
  )) : null;
  return <View style={{ gap: driverSpace.lg, alignSelf: 'stretch' }}>
    {children?.(markers)}
    {!canInteract ? <DriverStatus label={t('omw.requestsApproval')} tone="warning" />
      : loading ? <ActivityIndicator accessibilityLabel={t('omw.requestsLoading')} color={colors.primary} />
      : error ? <DriverNotice title={t('omw.requestsError')} tone="danger"
        action={<DriverButton label={t('omw.refreshRequests')} variant="quiet" onPress={() => setReload(value => value + 1)} />} /> : null}
  </View>;
}
