import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DriverButton, DriverNotice, DriverStatus } from '@/components/ui/driver-ui';
import { NativeMarker } from '@/components/native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { useDriverAccess } from '@/hooks/use-driver-access';
import { getDriverRouteRequests } from '@/lib/api';
import type { DriverRequestAlertSummary } from '@/types/auth';
import { driverSpace, useDriverColors } from '@/theme/driver-theme';
import type { OmwRoute } from './routes';

export function OmwRouteRequests({ route, radiusKm, children, enabled = true }: { route: OmwRoute; radiusKm: number; enabled?: boolean; children?: (markers: React.ReactNode) => React.ReactNode }) {
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
        const result = await getDriverRouteRequests(route.coordinates, radiusKm);
        if (active) { setAlerts(result.alerts); setError(false); }
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
  }, [canInteract, enabled, route.coordinates, radiusKm, reload]));

  const Marker = NativeMarker;
  const markers = canInteract && Marker ? alerts.filter(alert => typeof alert.pickup.latitude === 'number' && typeof alert.pickup.longitude === 'number').map(alert => (
    <Marker key={alert.requestId} coordinate={{ latitude: alert.pickup.latitude!, longitude: alert.pickup.longitude! }}
      title={alert.item?.title || t('Transport Request')} anchor={{ x: 0.5, y: 0.5 }}
      onPress={(event: { stopPropagation?: () => void }) => { event?.stopPropagation?.(); viewDetails(alert.requestId); }}>
      <View collapsable={false} style={styles.marker}>
        <Svg width={48} height={48} viewBox="0 0 48 48">
          <Circle cx={24} cy={24} r={22} fill={colors.primary} stroke={colors.surface} strokeWidth={3} />
          <Path d="M10 15h18v17H10z M28 21h6l5 6v5H28 M14 32a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M30 32a3 3 0 1 0 6 0a3 3 0 1 0-6 0"
            fill="none" stroke={colors.surface} strokeWidth={2.2} strokeLinejoin="round" />
        </Svg>
      </View>
    </Marker>
  )) : null;
  return <View style={{ gap: driverSpace.lg, alignSelf: 'stretch' }}>
    {children?.(markers)}
    {!canInteract ? <DriverStatus label={t('omw.requestsApproval')} tone="warning" />
      : loading ? <ActivityIndicator accessibilityLabel={t('omw.requestsLoading')} color={colors.primary} />
      : error ? <DriverNotice title={t('omw.requestsError')} tone="danger"
        action={<DriverButton label={t('omw.refreshRequests')} variant="quiet" onPress={() => setReload(value => value + 1)} />} /> : null}
  </View>;
}

const styles = StyleSheet.create({ marker: { width: 48, height: 48 } });
