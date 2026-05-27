import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function PickupItemScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Pickup Item</Text>
        <Text style={styles.subtitle}>Driver arrived at pickup. Continue to item pickup workflow.</Text>
        <Text style={styles.meta}>Trip ID: {tripId}</Text>
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
});
