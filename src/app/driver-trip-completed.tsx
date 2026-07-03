import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CompletedParams = {
  tripId?: string;
  deliveredAt?: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

export default function DriverTripCompletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<CompletedParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : 'N/A';
  const deliveredAt = typeof params.deliveredAt === 'string' ? params.deliveredAt : null;
  const payoutAvailableAt = deliveredAt
    ? new Date(new Date(deliveredAt).getTime() + 24 * 60 * 60 * 1000)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Trip Delivered</Text>
        <Text style={styles.subtitle}>Delivery confirmed successfully.</Text>
        <Text style={styles.meta}>Trip ID: {tripId}</Text>
        <Text style={styles.meta}>Delivered At: {formatDateTime(deliveredAt)}</Text>
        <Text style={styles.meta}>
          Expected wallet release: {payoutAvailableAt ? payoutAvailableAt.toLocaleString() : 'Within 24 hours'}
        </Text>
        <Text style={styles.notice}>
          Your payment will be transferred to your in-app wallet within 24 hours, minus the app commission.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace('/driver-home')}>
          <Text style={styles.buttonText}>Back to Driver Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#334155',
  },
  meta: {
    color: '#475569',
  },
  notice: {
    color: '#166534',
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
