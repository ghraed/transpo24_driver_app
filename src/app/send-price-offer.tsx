import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { sendDriverPriceOffer } from '@/lib/api';
import { formatDateTime } from '@/localization/format';
import type { SendDriverPriceOfferPayload, SupportedOfferCurrency } from '@/types/auth';

type SendOfferFormState = {
  price: string;
  currency: SupportedOfferCurrency;
  estimatedPickupAt: string;
  estimatedDeliveryAt: string;
  estimatedDurationMinutes: string;
  message: string;
};

type FormErrors = {
  requestId?: string;
  price?: string;
  currency?: string;
  estimatedPickupAt?: string;
  estimatedDeliveryAt?: string;
  estimatedDurationMinutes?: string;
  message?: string;
};

const OFFER_CURRENCIES: SupportedOfferCurrency[] = ['CHF', 'EUR', 'AED', 'SAR', 'QAR', 'USD'];

function parseOptionalIsoDate(rawValue: string): Date | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export default function SendPriceOfferScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const params = useLocalSearchParams();

  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : '';
  const pickupAddress = typeof params.pickupAddress === 'string' ? params.pickupAddress : '';
  const dropoffAddress = typeof params.dropoffAddress === 'string' ? params.dropoffAddress : '';
  const scheduledPickupAt = typeof params.scheduledPickupAt === 'string' ? params.scheduledPickupAt : null;

  const [form, setForm] = useState<SendOfferFormState>({
    price: '',
    currency: 'CHF',
    estimatedPickupAt: '',
    estimatedDeliveryAt: '',
    estimatedDurationMinutes: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestIdShort = useMemo(() => {
    if (!requestId) return '';
    return requestId.length > 12 ? `${requestId.slice(0, 6)}...${requestId.slice(-4)}` : requestId;
  }, [requestId]);

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};
    if (!requestId.trim()) {
      nextErrors.requestId = t('Missing request ID. Please go back to Available Requests.');
    }

    const priceNumber = Number(form.price.trim());
    if (!form.price.trim()) {
      nextErrors.price = t('Price is required.');
    } else if (!Number.isFinite(priceNumber)) {
      nextErrors.price = t('Price must be numeric.');
    } else if (priceNumber < 1 || priceNumber > 100000) {
      nextErrors.price = t('Price must be between 1 and 100000.');
    }

    if (!OFFER_CURRENCIES.includes(form.currency)) {
      nextErrors.currency = t('Unsupported currency selected.');
    }

    const pickupDate = parseOptionalIsoDate(form.estimatedPickupAt);
    if (form.estimatedPickupAt.trim() && !pickupDate) {
      nextErrors.estimatedPickupAt = t('Estimated pickup must be a valid date/time.');
    } else if (pickupDate && pickupDate.getTime() <= Date.now()) {
      nextErrors.estimatedPickupAt = t('Estimated pickup must be in the future.');
    }

    const deliveryDate = parseOptionalIsoDate(form.estimatedDeliveryAt);
    if (form.estimatedDeliveryAt.trim() && !deliveryDate) {
      nextErrors.estimatedDeliveryAt = t('Estimated delivery must be a valid date/time.');
    }

    if (pickupDate && deliveryDate && deliveryDate.getTime() <= pickupDate.getTime()) {
      nextErrors.estimatedDeliveryAt = t('Estimated delivery must be after estimated pickup.');
    }

    if (form.estimatedDurationMinutes.trim()) {
      const duration = Number(form.estimatedDurationMinutes.trim());
      if (!Number.isInteger(duration)) {
        nextErrors.estimatedDurationMinutes = t('Estimated duration must be a whole number.');
      } else if (duration < 1 || duration > 10080) {
        nextErrors.estimatedDurationMinutes = t('Estimated duration must be between 1 and 10080 minutes.');
      }
    }

    if (form.message.length > 1000) {
      nextErrors.message = t('Message must be at most 1000 characters.');
    }

    return nextErrors;
  };

  const onSubmit = async (): Promise<void> => {
    const validation = validate();
    setErrors(validation);
    setSubmitError('');
    if (Object.keys(validation).length > 0 || isSubmitting || !requestId.trim()) {
      return;
    }

    const payload: SendDriverPriceOfferPayload = {
      price: Number(form.price.trim()),
      currency: form.currency,
    };

    const pickupDate = parseOptionalIsoDate(form.estimatedPickupAt);
    if (pickupDate) {
      payload.estimatedPickupAt = pickupDate.toISOString();
    }

    const deliveryDate = parseOptionalIsoDate(form.estimatedDeliveryAt);
    if (deliveryDate) {
      payload.estimatedDeliveryAt = deliveryDate.toISOString();
    }

    if (form.estimatedDurationMinutes.trim()) {
      payload.estimatedDurationMinutes = Number(form.estimatedDurationMinutes.trim());
    }

    const trimmedMessage = form.message.trim();
    if (trimmedMessage) {
      payload.message = trimmedMessage;
    }

    setIsSubmitting(true);
    try {
      const response = await sendDriverPriceOffer(requestId, payload);
      router.replace({
        pathname: '/offer-waiting-response',
        params: {
          requestId: response.request.id,
          status: response.request.status,
          offerId: response.offer.id,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to send offer.');
      const normalized = message.toLowerCase();
      if (
        normalized.includes('invalid or expired token') ||
        normalized.includes('authorization') ||
        normalized.includes('unauthorized')
      ) {
        await signOut();
        router.replace('/');
        return;
      }
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>{t('Send Price Offer')}</Text>
            <Text style={styles.subtitle}>
              {t('Enter your price and timing so the customer can choose your offer.')}
            </Text>
            <Text style={styles.helperText}>
              {t('The customer will compare offers and choose the best driver.')}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Request Summary')}</Text>
            {serviceName ? <Text style={styles.valueText}>{t('Service')}: {serviceName}</Text> : null}
            {pickupAddress ? <Text style={styles.valueText}>{t('Pickup')}: {pickupAddress}</Text> : null}
            {dropoffAddress ? <Text style={styles.valueText}>{t('Dropoff')}: {dropoffAddress}</Text> : null}
            <Text style={styles.valueText}>{t('Schedule')}: {scheduledPickupAt ? formatDateTime(scheduledPickupAt) : t('Immediate pickup')}</Text>
            <Text style={styles.valueText}>{t('Request')}: {requestId ? requestIdShort : t('Missing request ID')}</Text>
            {errors.requestId ? <Text style={styles.errorText}>{errors.requestId}</Text> : null}
            {!requestId ? (
              <Pressable
                style={styles.backButton}
                onPress={() => router.replace('/receive-requests')}
              >
                <Text style={styles.backButtonText}>{t('Go Back to Available Requests')}</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Price Offer')}</Text>
            <Text style={styles.label}>{t('Price *')}</Text>
            <TextInput
              style={styles.input}
              value={form.price}
              onChangeText={(value) => setForm((prev) => ({ ...prev, price: value }))}
              placeholder="450"
              keyboardType="decimal-pad"
            />
            {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}

            <Text style={styles.label}>{t('Currency *')}</Text>
            <View style={styles.currencyRow}>
              {OFFER_CURRENCIES.map((currency) => (
                <Pressable
                  key={currency}
                  style={[
                    styles.currencyChip,
                    form.currency === currency ? styles.currencyChipSelected : undefined,
                  ]}
                  onPress={() => setForm((prev) => ({ ...prev, currency }))}
                >
                  <Text
                    style={[
                      styles.currencyChipText,
                      form.currency === currency ? styles.currencyChipTextSelected : undefined,
                    ]}
                  >
                    {currency}
                  </Text>
                </Pressable>
              ))}
            </View>
            {errors.currency ? <Text style={styles.errorText}>{errors.currency}</Text> : null}

            <Text style={styles.label}>{t('Estimated pickup date/time (optional)')}</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedPickupAt}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedPickupAt: value }))}
              placeholder="2026-07-14T15:00:00Z"
              autoCapitalize="none"
            />
            {errors.estimatedPickupAt ? <Text style={styles.errorText}>{errors.estimatedPickupAt}</Text> : null}

            <Text style={styles.label}>{t('Estimated delivery date/time (optional)')}</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedDeliveryAt}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedDeliveryAt: value }))}
              placeholder="2026-07-14T18:00:00Z"
              autoCapitalize="none"
            />
            {errors.estimatedDeliveryAt ? <Text style={styles.errorText}>{errors.estimatedDeliveryAt}</Text> : null}

            <Text style={styles.label}>{t('Estimated duration (minutes)')}</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedDurationMinutes}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedDurationMinutes: value }))}
              placeholder="120"
              keyboardType="number-pad"
            />
            {errors.estimatedDurationMinutes ? (
              <Text style={styles.errorText}>{errors.estimatedDurationMinutes}</Text>
            ) : null}

            <Text style={styles.label}>{t('Message (optional)')}</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={form.message}
              onChangeText={(value) => setForm((prev) => ({ ...prev, message: value }))}
              placeholder={t('Message (optional)')}
              multiline
              textAlignVertical="top"
            />
            {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={() => void onSubmit()}
            disabled={isSubmitting}
          >
            <Text style={styles.submitButtonText}>{t('Submit Offer')}</Text>
          </Pressable>

          {isSubmitting ? <Text style={styles.loadingText}>{t('Sending offer...')}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 32, gap: 14 },
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
  helperText: { color: '#64748B', fontSize: 13 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  valueText: { color: '#334155', fontSize: 14 },
  label: { color: '#0F172A', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  },
  messageInput: { minHeight: 100 },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  currencyChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currencyChipSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  currencyChipText: { color: '#0F172A', fontWeight: '600' },
  currencyChipTextSelected: { color: '#1D4ED8' },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
  },
  backButtonText: { color: '#1D4ED8', fontWeight: '700' },
  submitButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  loadingText: { color: '#475569', textAlign: 'center' },
  errorText: { color: '#B91C1C', fontSize: 13 },
});
