import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverIcon } from '@/components/driver-icon';
import { getDriverAvailability, updateDriverOnlineStatus } from '@/lib/api';
import { clearLastOnboardingRoute } from '@/lib/auth-storage';
import { nextStepToRoute } from '@/lib/onboarding-route';
import { LANGUAGE_CONFIGS, SUPPORTED_LANGUAGES } from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import type { DriverAvailabilityResponse } from '@/types/auth';

function hasCompletedAvailabilitySetup(availability: DriverAvailabilityResponse): boolean {
  return (
    availability.nextStep !== 'SET_AVAILABILITY' &&
    Boolean(availability.id) &&
    availability.baseLatitude !== null &&
    availability.baseLongitude !== null &&
    availability.weeklySchedule.some((day) => day.isAvailable)
  );
}

export default function DriverHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language, isChangingLanguage, setLanguage } = useAppLanguage();
  const [isOnline, setIsOnline] = useState(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [requiresAvailabilitySetup, setRequiresAvailabilitySetup] = useState(false);

  useEffect(() => {
    void clearLastOnboardingRoute();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAvailability = async (): Promise<void> => {
      setIsLoadingAvailability(true);
      setAvailabilityError('');
      try {
        const availability = await getDriverAvailability();
        if (isMounted) {
          setIsOnline(availability.isOnline);
          setRequiresAvailabilitySetup(!hasCompletedAvailabilitySetup(availability));
        }
      } catch (error) {
        if (isMounted) {
          setAvailabilityError(error instanceof Error ? error.message : t('Failed to load availability.'));
        }
      } finally {
        if (isMounted) setIsLoadingAvailability(false);
      }
    };

    void loadAvailability();
    return () => {
      isMounted = false;
    };
  }, [t]);

  const onToggleAvailability = async (nextValue: boolean): Promise<void> => {
    if (isLoadingAvailability || isUpdatingAvailability) return;
    if (requiresAvailabilitySetup) {
      setAvailabilityError(t('Set availability first before changing online status.'));
      router.push(nextStepToRoute('SET_AVAILABILITY'));
      return;
    }

    setIsUpdatingAvailability(true);
    setAvailabilityError('');
    try {
      const response = await updateDriverOnlineStatus({ isOnline: nextValue });
      setIsOnline(response.isOnline);
      setRequiresAvailabilitySetup(!hasCompletedAvailabilitySetup(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to update online status.');
      setAvailabilityError(message);
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('Go back')} hitSlop={12} onPress={() => router.back()}>
          <DriverIcon name="arrow-back" size={29} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>{t('Settings')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>{t('Availability')}</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t('Online status')}</Text>
              <Text style={styles.rowDescription}>
                {isLoadingAvailability
                  ? t('Loading online status...')
                  : isOnline
                    ? t('You are online and can receive matching requests.')
                    : t('You are offline and will not receive new requests.')}
              </Text>
            </View>
            {isLoadingAvailability ? (
              <ActivityIndicator size="small" color="#F0AF00" />
            ) : (
              <Switch
                value={isOnline}
                onValueChange={(value) => void onToggleAvailability(value)}
                disabled={isUpdatingAvailability}
                trackColor={{ false: '#CBD5E1', true: '#F7D560' }}
                thumbColor={isOnline ? '#F0AF00' : '#FFFFFF'}
              />
            )}
          </View>
          {isUpdatingAvailability ? <Text style={styles.hint}>{t('Updating availability...')}</Text> : null}
          {requiresAvailabilitySetup ? (
            <Pressable style={styles.setupButton} onPress={() => router.push(nextStepToRoute('SET_AVAILABILITY'))}>
              <Text style={styles.setupButtonText}>{t('Complete Availability Setup')}</Text>
              <DriverIcon name="chevron-right" size={20} color="#A96900" />
            </Pressable>
          ) : null}
          {availabilityError ? <Text style={styles.errorText}>{availabilityError}</Text> : null}
        </View>

        <Text style={styles.sectionLabel}>{t('Preferences')}</Text>
        <View style={styles.settingsCard}>
          <Text style={styles.rowTitle}>{t('Language')}</Text>
          <Text style={styles.rowDescription}>{t('Current language')}: {LANGUAGE_CONFIGS[language].nativeLabel}</Text>
          <View style={styles.languageList}>
            {SUPPORTED_LANGUAGES.map((code) => {
              const config = LANGUAGE_CONFIGS[code];
              const selected = code === language;
              return (
                <Pressable
                  key={code}
                  style={[styles.languageButton, selected && styles.languageButtonSelected]}
                  onPress={() => void setLanguage(code)}
                  disabled={isChangingLanguage}
                >
                  <Text style={[styles.languageText, selected && styles.languageTextSelected]}>{config.nativeLabel}</Text>
                  <Text style={[styles.languageMeta, selected && styles.languageTextSelected]}>{selected ? '✓' : config.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t('Payments')}</Text>
        <Pressable style={styles.settingsCard} onPress={() => router.push('/stripe-connect')}>
          <View style={styles.settingRow}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{t('Payout account')}</Text>
              <Text style={styles.rowDescription}>{t('Manage your Stripe Connect payout account.')}</Text>
            </View>
            <DriverIcon name="chevron-right" size={23} color="#9CA6B5" />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F9FB' },
  header: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF' },
  title: { color: '#202020', fontSize: 19, fontWeight: '800' },
  headerSpacer: { width: 29 },
  content: { padding: 20, paddingBottom: 38 },
  sectionLabel: { marginTop: 4, marginBottom: 8, color: '#737E8E', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsCard: { marginBottom: 24, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#E4E7EC', backgroundColor: '#FFFFFF' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowCopy: { flex: 1 },
  rowTitle: { color: '#202020', fontSize: 16, fontWeight: '800' },
  rowDescription: { marginTop: 4, color: '#687386', fontSize: 13, lineHeight: 18 },
  hint: { marginTop: 12, color: '#A96900', fontSize: 13, fontWeight: '600' },
  setupButton: { marginTop: 14, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF4D6' },
  setupButtonText: { color: '#A96900', fontSize: 13, fontWeight: '800' },
  errorText: { marginTop: 12, color: '#C92828', fontSize: 13 },
  languageList: { marginTop: 14, gap: 9 },
  languageButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#DDE2E9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  languageButtonSelected: { borderColor: '#F0AF00', backgroundColor: '#FFF8E8' },
  languageText: { color: '#202020', fontSize: 14, fontWeight: '700' },
  languageMeta: { color: '#737E8E', fontSize: 12 },
  languageTextSelected: { color: '#A96900' },
});
