import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GoToPickupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Go to Pickup Location</Text>
        <Text style={styles.subtitle}>
          Pickup workflow screen placeholder for the next roadmap step.
        </Text>
        <Text style={styles.meta}>Request ID: {requestId || 'N/A'}</Text>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/accepted-jobs')}>
          <Text style={styles.primaryButtonText}>Back to Accepted Jobs</Text>
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
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
  },
  meta: {
    color: '#334155',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
