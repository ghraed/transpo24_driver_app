import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SendPriceOfferScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string; alertId?: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Send Price Offer</Text>
        <Text style={styles.subtitle}>Placeholder screen for the next step.</Text>
        <Text style={styles.meta}>Request ID: {params.requestId || 'N/A'}</Text>
        <Text style={styles.meta}>Alert ID: {params.alertId || 'N/A'}</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/receive-requests')}>
          <Text style={styles.buttonText}>Back to Requests</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
  meta: { color: '#334155', fontSize: 13 },
  button: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
