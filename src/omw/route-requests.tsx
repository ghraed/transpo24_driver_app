import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DriverButton, DriverCard, DriverNotice, DriverStatus, DriverText } from '@/components/ui/driver-ui';
import { TripRouteCard } from '@/components/ui/trip-ui';
import { useDriverAccess } from '@/hooks/use-driver-access';
import { getDriverRouteRequests } from '@/lib/api';
import type { DriverRequestAlertSummary } from '@/types/auth';
import { driverSpace, useDriverColors } from '@/theme/driver-theme';
import type { OmwRoute } from './routes';

export function OmwRouteRequests({ route, radiusKm }: { route: OmwRoute; radiusKm: number }) {
  const { t, i18n } = useTranslation();
  const colors = useDriverColors();
  const router = useRouter();
  const { canInteract } = useDriverAccess();
  const [alerts, setAlerts] = useState<DriverRequestAlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    setAlerts([]); setLoading(true); setError(false);
    const load = async () => {
      if (pending || !canInteract) return;
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
  }, [canInteract, route.coordinates, radiusKm, reload]));

  if (!canInteract) return <DriverStatus label={t('omw.requestsApproval')} tone="warning" />;
  return <View style={{ gap: driverSpace.lg }}>
    <DriverText variant="section">{t('omw.requestsTitle', { count: alerts.length })}</DriverText>
    {loading ? <ActivityIndicator accessibilityLabel={t('omw.requestsLoading')} color={colors.primary} />
      : error ? <DriverNotice title={t('omw.requestsError')} tone="danger"
        action={<DriverButton label={t('omw.refreshRequests')} variant="quiet" onPress={() => setReload(value => value + 1)} />} />
      : !alerts.length ? <DriverNotice title={t('omw.noRequests')} description={t('omw.noRequestsHelp')} /> : null}
    {alerts.map(alert => <DriverCard key={alert.requestId}>
      <DriverText variant="section">{i18n.language === 'ar' ? alert.service?.nameAr : t(alert.service?.nameEn || 'Transport Request')}</DriverText>
      <DriverText variant="caption" secondary>{t('omw.requestDistance', { distance: new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', { maximumFractionDigits: 1 }).format(alert.distanceKm ?? 0) })}</DriverText>
      <TripRouteCard pickup={alert.pickup.address || t('Pickup')} dropoff={alert.dropoff.address || t('Dropoff')} />
      <DriverText variant="caption">{alert.schedule.isImmediate ? t('Immediate') : new Date(alert.schedule.scheduledPickupAt!).toLocaleString(i18n.resolvedLanguage ?? 'en')}</DriverText>
      <DriverButton label={t('omw.viewRequest')} variant="secondary" onPress={() => router.push({ pathname: '/review-request-details', params: { requestId: alert.requestId } })} />
    </DriverCard>)}
  </View>;
}
