import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRequestStatusLabel } from '@/lib/request-status-display';

export default function OfferWaitingResponseScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ requestId?: string; status?: string; offerId?: string }>();
  const statusLabel = getRequestStatusLabel(
    typeof params.status === 'string' ? params.status : null,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('Offer Sent Successfully')}</Text>
        <Text style={styles.subtitle}>
          {t('Your offer is pending customer review. We will notify you when the customer chooses.')}
        </Text>
        <Text style={styles.meta}>
          {t('Request ID: {{value}}', { value: params.requestId || t('N/A') })}
        </Text>
        <Text style={styles.meta}>
          {t('Offer ID: {{value}}', { value: params.offerId || t('N/A') })}
        </Text>
        <Text style={styles.meta}>
          {t('Request Status: {{value}}', { value: statusLabel || t('N/A') })}
        </Text>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/receive-requests')}>
          <Text style={styles.primaryButtonText}>{t('Back to Available Requests')}</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/accepted-jobs')}>
          <Text style={styles.primaryButtonText}>{t('Check Accepted Jobs')}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/driver-home')}>
          <Text style={styles.secondaryButtonText}>{t('Go to Driver Home')}</Text>
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
    fontSize: 14,
    color: '#475569',
  },
  meta: {
    fontSize: 13,
    color: '#334155',
  },
  primaryButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '700',
  },
});
