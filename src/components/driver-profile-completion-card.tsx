import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DriverButton, DriverCard, DriverIcon, DriverStatus, DriverText } from '@/components/ui/driver-ui';
import { useAppLanguage } from '@/localization/provider';
import { driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

export function DriverProfileCompletionCard({ onFinishProfile }: { onFinishProfile: () => void }) {
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const colors = useDriverColors();

  return (
    <DriverCard style={styles.card}>
      <View style={[styles.header, isRTL && styles.rtlRow]}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]} accessible={false}>
          <DriverIcon
            name={{ ios: 'person.crop.rectangle', android: 'badge', web: 'badge' }}
            size={28}
            color={colors.onAccent}
          />
        </View>
        <DriverStatus label={t('Profile incomplete')} tone="warning" />
      </View>

      <View style={styles.copy}>
        <DriverText accessibilityRole="header" variant="title" style={isRTL && styles.rtlText}>
          {t('Complete your driver profile')}
        </DriverText>
        <DriverText secondary style={isRTL && styles.rtlText}>
          {t('Add your personal information to continue your driver registration.')}
        </DriverText>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <DriverButton
          label={t('Finish Profile')}
          onPress={onFinishProfile}
        />
      </View>
    </DriverCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: driverRadius.xl,
    padding: driverSpace.xxl,
    gap: driverSpace.xxl,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: driverSpace.lg,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: driverRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: driverSpace.sm },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: driverSpace.xl },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
