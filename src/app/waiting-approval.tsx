import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { nextStepToRoute } from '@/lib/onboarding-route';

export default function WaitingApprovalScreen() {
  const router = useRouter();
  const { driver, refreshDriverMe, signOut } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSigningOut, setIsSigningOut] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const statusCopy = useMemo(() => {
    if (driver?.status === 'REJECTED') {
      return {
        title: 'Review Declined',
        subtitle:
          'Your submission was declined by admin review. You can return to the login screen and try again later.',
      };
    }

    if (driver?.status === 'APPROVED') {
      return {
        title: 'Approval Updated',
        subtitle: 'Your account was approved. Refresh to continue to the next step.',
      };
    }

    return {
      title: 'Waiting Approval',
      subtitle: 'Your driver account is under admin review.',
    };
  }, [driver?.status]);

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
        error instanceof Error ? error.message : 'Failed to refresh approval status.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBackToLogin = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setErrorMessage('');

    try {
      await signOut();
      router.replace('/');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sign out.');
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{statusCopy.title}</Text>
        <Text style={styles.subtitle}>{statusCopy.subtitle}</Text>
        <Text style={styles.statusText}>Current status: {driver?.status ?? 'PENDING_REVIEW'}</Text>

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
            <Text style={styles.primaryButtonText}>Refresh status</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={() => {
            void handleBackToLogin();
          }}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed ? styles.secondaryButtonPressed : null,
            isSigningOut ? styles.buttonDisabled : null,
          ]}
        >
          {isSigningOut ? (
            <ActivityIndicator color="#1D4ED8" size="small" />
          ) : (
            <Text style={styles.secondaryButtonText}>Back to login</Text>
          )}
        </Pressable>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569', lineHeight: 20 },
  statusText: { color: '#334155', fontSize: 13, fontWeight: '600' },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderColor: '#BFDBFE',
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
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
  },
});
