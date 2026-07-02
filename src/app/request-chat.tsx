import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RequestChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Chat with Customer</Text>
        <Text style={styles.subtitle}>
          Internal chat access becomes available after you are selected for a request.
        </Text>
        <Text style={styles.message}>
          This project does not yet include the backend chat messaging API. This screen is the
          placeholder entry point for request {requestId}.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.replace({
              pathname: '/accepted-job-details',
              params: { requestId },
            })
          }
        >
          <Text style={styles.primaryButtonText}>Back to Job Details</Text>
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
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  message: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 12,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
