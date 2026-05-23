import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function SetAvailabilityScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Set Availability</Text>
        <Text style={styles.subtitle}>Next step: choose when you are available to drive.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', padding: 20 },
  card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { marginTop: 6, color: '#475569' },
});
