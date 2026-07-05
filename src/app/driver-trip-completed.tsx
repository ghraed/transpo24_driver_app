import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CompletedParams = {
  tripId?: string;
  deliveredAt?: string;
};

export default function DriverTripCompletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<CompletedParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : 'N/A';
  const deliveredAt = typeof params.deliveredAt === 'string' ? params.deliveredAt : null;
  const releaseAt = deliveredAt
    ? new Date(new Date(deliveredAt).getTime() + 24 * 60 * 60 * 1000)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Trip Delivered</Text>
        <Text style={styles.subtitle}>Delivery confirmed successfully.</Text>
        <Text style={styles.meta}>Trip ID: {tripId}</Text>
        <Text style={styles.meta}>
          Delivered At: {deliveredAt ? new Date(deliveredAt).toLocaleString() : 'N/A'}
        </Text>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Payout Information</Text>
          <Text style={styles.noticeText}>
            Your payment will be transferred to your in-app wallet within 24 hours, minus the app commission.
          </Text>
          <Text style={styles.noticeMeta}>
            Expected wallet release: {releaseAt ? releaseAt.toLocaleString() : 'Within 24 hours'}
          </Text>
        </View>
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
  noticeCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  noticeTitle: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '700',
  },
  noticeText: {
    color: '#1E3A8A',
    fontSize: 13,
  },
  noticeMeta: {
    color: '#1D4ED8',
    fontSize: 12,
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
