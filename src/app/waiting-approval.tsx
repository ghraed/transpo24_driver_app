import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { nextStepToRoute } from '@/lib/onboarding-route';

export default function WaitingApprovalScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { driver, refreshDriverMe } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const statusCopy = useMemo(() => {
    if (driver?.status === 'REJECTED') {
      return {
        title: t('Review Declined'),
        subtitle:
          t('Your submission was declined by admin review. You can return to the home screen and try again later.'),
      };
    }

    if (driver?.status === 'APPROVED') {
      return {
        title: t('Approval Updated'),
        subtitle: t('Your account was approved. Refresh to continue to the next step.'),
      };
    }

    return {
      title: t('Waiting Approval'),
      subtitle: t('Your driver account is under admin review.'),
    };
  }, [driver?.status, t]);

  const handleRefreshStatus = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setErrorMessage('');

    try {
      const response = await refreshDriverMe();
      if (response.nextStep !== 'WAITING_APPROVAL') {
        router.replace(nextStepToRoute(response.nextStep));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('Failed to refresh approval status.'),
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBackToHome = () => {
    router.replace('/receive-requests');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{statusCopy.title}</Text>
        <Text style={styles.subtitle}>{statusCopy.subtitle}</Text>
        <Text style={styles.statusText}>{t('Current status')}: {driver?.status ?? 'PENDING_REVIEW'}</Text>

        <Pressable
          accessibilityRole="button"
          disabled={isRefreshing}
          onPress={() => {
            void handleRefreshStatus();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.primaryButtonPressed : null,
            isRefreshing ? styles.buttonDisabled : null,
          ]}
        >
          {isRefreshing ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('Refresh status')}</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={handleBackToHome}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.secondaryButtonPressed : null,
          ]}
        >
          <Text style={styles.secondaryButtonText}>{t('Back to home')}</Text>
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#DFE3E8', borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#202020' },
  subtitle: { color: '#707A8C', lineHeight: 20 },
  statusText: { color: '#505A6A', fontSize: 13, fontWeight: '600' },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1B900',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderColor: '#F3D26B',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#F1B900',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
});
