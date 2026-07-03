import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  connectSocket,
  onOfferAccepted,
  onOfferRejected,
  onSocketConnected,
  onSocketDisconnect,
  onSocketError,
} from '@/services/socketService';
import { validateOfferAcceptedPayload, validateOfferRejectedPayload } from '@/utils/locationValidation';

export default function OfferWaitingResponseScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ requestId?: string; status?: string; offerId?: string }>();
  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const [selectionMessage, setSelectionMessage] = useState<string>('');
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected' | 'connecting'>(
    'connecting',
  );
  const [socketMessage, setSocketMessage] = useState<string>('');

  useEffect(() => {
    if (!accessToken) return;

    connectSocket(accessToken);
    setSocketStatus('connecting');

    const unsubscribeAccepted = onOfferAccepted((payload) => {
      const validated = validateOfferAcceptedPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setSelectionMessage(
        'You were selected for this request. The amount has been reserved from the customer wallet.',
      );
      router.replace({
        pathname: '/accepted-job-details',
        params: { requestId: validated.tripId },
      });
    });

    const unsubscribeRejected = onOfferRejected((payload) => {
      const validated = validateOfferRejectedPayload(payload);
      if (!validated || validated.requestId !== requestId) return;

      setSelectionMessage('Your offer was not selected for this request.');
    });

    const unsubscribeConnected = onSocketConnected(() => {
      setSocketStatus('connected');
      setSocketMessage('');
    });
    const unsubscribeDisconnected = onSocketDisconnect(() => {
      setSocketStatus('disconnected');
    });
    const unsubscribeSocketError = onSocketError((message) => {
      setSocketStatus('disconnected');
      setSocketMessage(message);
    });

    return () => {
      unsubscribeAccepted();
      unsubscribeRejected();
      unsubscribeConnected();
      unsubscribeDisconnected();
      unsubscribeSocketError();
    };
  }, [accessToken, requestId, router]);

  const waitingMessage = useMemo(() => {
    if (selectionMessage) return selectionMessage;
    return 'Your offer is pending customer review. We will notify you when the customer chooses.';
  }, [selectionMessage]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Offer Sent Successfully</Text>
        <Text style={styles.subtitle}>
          {waitingMessage}
        </Text>
        <Text style={styles.meta}>Request ID: {params.requestId || 'N/A'}</Text>
        <Text style={styles.meta}>Offer ID: {params.offerId || 'N/A'}</Text>
        <Text style={styles.meta}>Request Status: {params.status || 'N/A'}</Text>
        <Text style={styles.meta}>
          Real-time connection: {socketStatus}
          {socketMessage ? ` • ${socketMessage}` : ''}
        </Text>

        <Pressable style={styles.primaryButton} onPress={() => router.replace('/receive-requests')}>
          <Text style={styles.primaryButtonText}>Back to Available Requests</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/accepted-jobs')}>
          <Text style={styles.primaryButtonText}>Check Accepted Jobs</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.replace('/driver-home')}>
          <Text style={styles.secondaryButtonText}>Go to Driver Home</Text>
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
