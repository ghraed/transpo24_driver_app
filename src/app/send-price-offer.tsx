import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { sendDriverPriceOffer } from '@/lib/api';
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Immediate pickup';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Immediate pickup';
  return date.toLocaleString();
}

function parseOptionalIsoDate(rawValue: string): Date | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatVehicleCondition(condition: string): string {
  if (!condition.trim()) return 'N/A';
  return condition.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}
export default function SendPriceOfferScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const params = useLocalSearchParams();

  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : '';
  const vehicleCondition = typeof params.vehicleCondition === 'string' ? params.vehicleCondition : '';
  const vehicleConditionNotes =
    typeof params.vehicleConditionNotes === 'string' ? params.vehicleConditionNotes : '';
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
  const [submitError, setSubmitError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const requestIdShort = useMemo(() => {
    if (!requestId) return '';
    return requestId.length > 12 ? `${requestId.slice(0, 6)}...${requestId.slice(-4)}` : requestId;
  }, [requestId]);

  const validate = (): FormErrors => {
    const nextErrors: FormErrors = {};
    if (!requestId.trim()) {
      nextErrors.requestId = 'Missing request ID. Please go back to Available Requests.';
    }

    const priceNumber = Number(form.price.trim());
    if (!form.price.trim()) {
      nextErrors.price = 'Price is required.';
    } else if (!Number.isFinite(priceNumber)) {
      nextErrors.price = 'Price must be numeric.';
    } else if (priceNumber < 1 || priceNumber > 100000) {
      nextErrors.price = 'Price must be between 1 and 100000.';
    }

    if (!OFFER_CURRENCIES.includes(form.currency)) {
      nextErrors.currency = 'Unsupported currency selected.';
    }

    const pickupDate = parseOptionalIsoDate(form.estimatedPickupAt);
    if (form.estimatedPickupAt.trim() && !pickupDate) {
      nextErrors.estimatedPickupAt = 'Estimated pickup must be a valid date/time.';
    } else if (pickupDate && pickupDate.getTime() <= Date.now()) {
      nextErrors.estimatedPickupAt = 'Estimated pickup must be in the future.';
    }

    const deliveryDate = parseOptionalIsoDate(form.estimatedDeliveryAt);
    if (form.estimatedDeliveryAt.trim() && !deliveryDate) {
      nextErrors.estimatedDeliveryAt = 'Estimated delivery must be a valid date/time.';
    }

    if (pickupDate && deliveryDate && deliveryDate.getTime() <= pickupDate.getTime()) {
      nextErrors.estimatedDeliveryAt = 'Estimated delivery must be after estimated pickup.';
    }

    if (form.estimatedDurationMinutes.trim()) {
      const duration = Number(form.estimatedDurationMinutes.trim());
      if (!Number.isInteger(duration)) {
        nextErrors.estimatedDurationMinutes = 'Estimated duration must be a whole number.';
      } else if (duration < 1 || duration > 10080) {
        nextErrors.estimatedDurationMinutes = 'Estimated duration must be between 1 and 10080 minutes.';
      }
    }

    if (form.message.length > 1000) {
      nextErrors.message = 'Message must be at most 1000 characters.';
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
      const message = error instanceof Error ? error.message : 'Failed to send offer.';
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
            <Text style={styles.title}>Send Price Offer</Text>
            <Text style={styles.subtitle}>
              Enter your price and timing so the customer can choose your offer.
            </Text>
            <Text style={styles.helperText}>
              The customer will compare offers and choose the best driver.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Request Summary</Text>
            {serviceName ? <Text style={styles.valueText}>Service: {serviceName}</Text> : null}
            {vehicleCondition ? (
              <Text style={styles.valueText}>Vehicle condition: {formatVehicleCondition(vehicleCondition)}</Text>
            ) : null}
            {vehicleConditionNotes ? (
              <Text style={styles.valueText}>Condition notes: {vehicleConditionNotes}</Text>
            ) : null}
            {pickupAddress ? <Text style={styles.valueText}>Pickup: {pickupAddress}</Text> : null}
            {dropoffAddress ? <Text style={styles.valueText}>Dropoff: {dropoffAddress}</Text> : null}
            <Text style={styles.valueText}>Schedule: {formatDateTime(scheduledPickupAt)}</Text>
            <Text style={styles.valueText}>Request: {requestId ? requestIdShort : 'Missing request ID'}</Text>
            {errors.requestId ? <Text style={styles.errorText}>{errors.requestId}</Text> : null}
            {!requestId ? (
              <Pressable
                style={styles.backButton}
                onPress={() => router.replace('/receive-requests')}
              >
                <Text style={styles.backButtonText}>Go Back to Available Requests</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Price Offer</Text>
            <Text style={styles.label}>Price *</Text>
            <TextInput
              style={styles.input}
              value={form.price}
              onChangeText={(value) => setForm((prev) => ({ ...prev, price: value }))}
              placeholder="450"
              keyboardType="decimal-pad"
            />
            {errors.price ? <Text style={styles.errorText}>{errors.price}</Text> : null}

            <Text style={styles.label}>Currency *</Text>
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
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Estimated Timing</Text>
            <Text style={styles.label}>Estimated pickup date/time (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedPickupAt}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedPickupAt: value }))}
              placeholder="2026-09-15T10:30:00.000Z"
              autoCapitalize="none"
            />
            {errors.estimatedPickupAt ? <Text style={styles.errorText}>{errors.estimatedPickupAt}</Text> : null}

            <Text style={styles.label}>Estimated delivery date/time (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedDeliveryAt}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedDeliveryAt: value }))}
              placeholder="2026-09-15T17:30:00.000Z"
              autoCapitalize="none"
            />
            {errors.estimatedDeliveryAt ? <Text style={styles.errorText}>{errors.estimatedDeliveryAt}</Text> : null}

            <Text style={styles.label}>Estimated duration in minutes (optional)</Text>
            <TextInput
              style={styles.input}
              value={form.estimatedDurationMinutes}
              onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedDurationMinutes: value }))}
              placeholder="420"
              keyboardType="number-pad"
            />
            {errors.estimatedDurationMinutes ? (
              <Text style={styles.errorText}>{errors.estimatedDurationMinutes}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Message to Customer</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.message}
              onChangeText={(value) => setForm((prev) => ({ ...prev, message: value }))}
              placeholder="Example: I can pick up your item tomorrow morning and deliver it safely."
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.charCounter}>{form.message.length}/1000</Text>
            {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[
              styles.submitButton,
              (isSubmitting || Object.keys(validate()).length > 0) ? styles.disabledButton : undefined,
            ]}
            onPress={() => void onSubmit()}
            disabled={isSubmitting || Object.keys(validate()).length > 0}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Send Offer</Text>
            )}
          </Pressable>
          {isSubmitting ? <Text style={styles.loadingText}>Sending offer...</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 140,
    gap: 12,
  },
  header: {
    gap: 4,
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
  helperText: {
    fontSize: 13,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  valueText: {
    fontSize: 13,
    color: '#334155',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 96,
  },
  charCounter: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  currencyChipSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  currencyChipText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  currencyChipTextSelected: {
    color: '#1D4ED8',
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 12,
  },
  backButton: {
    marginTop: 4,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
});
