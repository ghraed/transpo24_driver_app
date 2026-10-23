import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DriverCard, DriverIcon, DriverText } from './driver-ui';
import { driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

export function TripProgress({ current = 0 }: { current?: number }) {
  const { t, i18n } = useTranslation();
  const colors = useDriverColors();
  return (
    <View style={styles.progress} accessibilityLabel={t('pickupUi.tripProgress')}>
      {['pickupUi.pickup', 'pickupUi.delivery', 'pickupUi.complete'].map((key, index) => (
        <View key={key} style={styles.step}>
          <View style={styles.stepTrack}>
            {index < 2 ? (
              <View
                style={[
                  styles.line,
                  { backgroundColor: colors.border },
                  i18n.dir() === 'rtl' ? { right: '50%' } : { left: '50%' },
                ]}
              />
            ) : null}
            <View
              style={[
                styles.stepNumber,
                {
                  backgroundColor: current === index ? colors.accent : colors.surfaceSubtle,
                  borderColor: current === index ? colors.accent : colors.border,
                },
              ]}
            >
              <DriverText
                variant="caption"
                style={{ color: current === index ? colors.onAccent : colors.textSecondary }}
              >
                {index + 1}
              </DriverText>
            </View>
          </View>
          <DriverText variant="caption" secondary={index !== current} style={styles.stepLabel}>
            {t(key)}
          </DriverText>
        </View>
      ))}
    </View>
  );
}
export function TripRouteCard({
  pickup,
  dropoff,
  activeStop = 'pickup',
  pickupLabel,
  dropoffLabel,
  style,
}: {
  pickup: string;
  dropoff: string;
  activeStop?: 'pickup' | 'dropoff';
  pickupLabel?: string;
  dropoffLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useDriverColors();
  const { t } = useTranslation();
  return (
    <DriverCard style={style}>
      <View style={styles.routeRow}>
        <View style={styles.routeTrack}>
          <View
            style={[
              styles.routeDot,
              { borderColor: colors.text, backgroundColor: colors.pickupMarker },
            ]}
          />
          <View style={[styles.routeLine, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.routeCopy}>
          <DriverText variant="caption" secondary>
            {pickupLabel ?? t('pickupUi.pickup')}
          </DriverText>
          <DriverText variant={activeStop === 'pickup' ? 'section' : 'body'}>{pickup}</DriverText>
        </View>
      </View>
      <View style={styles.routeRow}>
        <View style={styles.routeTrack}>
          <DriverIcon name={{ ios: 'flag', android: 'flag', web: 'flag' }} size={18} />
        </View>
        <View style={styles.routeCopy}>
          <DriverText variant="caption" secondary>
            {dropoffLabel ?? t('Dropoff')}
          </DriverText>
          <DriverText variant={activeStop === 'dropoff' ? 'section' : 'body'}>{dropoff}</DriverText>
        </View>
      </View>
    </DriverCard>
  );
}
const styles = StyleSheet.create({
  progress: { width: '100%', flexDirection: 'row' },
  step: { flex: 1, minWidth: 0, alignItems: 'center', gap: driverSpace.sm },
  stepTrack: { width: '100%', alignItems: 'center' },
  stepLabel: { textAlign: 'center', alignSelf: 'stretch' },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: driverRadius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: { position: 'absolute', top: 14, width: '100%', height: 1 },
  routeRow: { flexDirection: 'row', gap: driverSpace.md },
  routeTrack: { width: 20, alignItems: 'center' },
  routeDot: { width: 14, height: 14, borderWidth: 3, borderRadius: 7, marginTop: 4 },
  routeLine: {
    width: 1,
    flex: 1,
    minHeight: 24,
    marginTop: driverSpace.sm,
    marginBottom: -driverSpace.sm,
  },
  routeCopy: { flex: 1, gap: driverSpace.xs },
});
