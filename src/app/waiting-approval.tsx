import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { nextStepToRoute } from '@/lib/onboarding-route';

export default function WaitingApprovalScreen() {
  const router = useRouter();
  const { approveDriverForTesting } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleApproveForTesting = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await approveDriverForTesting();
      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to approve driver in testing mode.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Waiting Approval</Text>
        <Text style={styles.subtitle}>Your driver account is pending approval.</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => {
            void handleApproveForTesting();
          }}
          style={({ pressed }) => [
            styles.testButton,
            pressed ? styles.testButtonPressed : null,
            isSubmitting ? styles.testButtonDisabled : null,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.testButtonText}>Approve Driver Account</Text>
          )}
        </Pressable>
        <Text style={styles.testWarning}>This is for test and it should be deleted soon!</Text>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { marginTop: 6, color: '#475569' },
  testButton: {
    marginTop: 18,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  testButtonPressed: {
    opacity: 0.9,
  },
  testButtonDisabled: {
    opacity: 0.7,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  testWarning: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 12,
    color: '#DC2626',
    fontSize: 13,
  },
});
