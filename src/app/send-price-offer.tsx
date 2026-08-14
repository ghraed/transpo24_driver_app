import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { sendDriverPriceOffer } from '@/lib/api';
import { currencyForCountryCode, getCountryLabel } from '@/lib/country-currency';
import { formatDateTime } from '@/localization/format';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { translateDynamicBatch } from '@/services/translation-service';
import type { SendDriverPriceOfferPayload } from '@/types/auth';

type SendOfferFormState = {
  price: string;
  estimatedPickupAt: string;
  estimatedDeliveryAt: string;
  estimatedDurationMinutes: string;
  message: string;
};

type FormErrors = {
  requestId?: string;
  price?: string;
  estimatedPickupAt?: string;
  estimatedDeliveryAt?: string;
  estimatedDurationMinutes?: string;
  message?: string;
};

const PLATFORM_FEE_PERCENTAGE = 10;

function formatOfferAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parseOptionalIsoDate(rawValue: string): Date | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeDynamicText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
}

function formatDisplayAddress(
  address: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!address) return t('Address unavailable');
  if (address === 'Current location') return t('Current location');
  return address;
}

export default function SendPriceOfferScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { driver, signOut } = useAuth();
  const params = useLocalSearchParams();

  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : '';
  const pickupAddress = typeof params.pickupAddress === 'string' ? params.pickupAddress : '';
  const dropoffAddress = typeof params.dropoffAddress === 'string' ? params.dropoffAddress : '';
  const scheduledPickupAt = typeof params.scheduledPickupAt === 'string' ? params.scheduledPickupAt : null;

  const [form, setForm] = useState<SendOfferFormState>({
    price: '',
    estimatedPickupAt: '',
    estimatedDeliveryAt: '',
    estimatedDurationMinutes: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [translatedTextByKey, setTranslatedTextByKey] = useState<Record<string, string>>({});

  const requestIdShort = useMemo(() => {
    if (!requestId) return '';
    return requestId.length > 12 ? `${requestId.slice(0, 6)}...${requestId.slice(-4)}` : requestId;
  }, [requestId]);
  const offerCurrency = useMemo(
    () => currencyForCountryCode(driver?.countryCode),
    [driver?.countryCode],
  );
  const driverCountryLabel = useMemo(
    () => getCountryLabel(driver?.countryCode),
    [driver?.countryCode],
  );
  const offerEarningsPreview = useMemo(() => {
    const price = Number(form.price.trim());
    if (!Number.isFinite(price) || price <= 0) {
      return null;
    }

    const platformFee = Math.round(price * (PLATFORM_FEE_PERCENTAGE / 100) * 100) / 100;
    return {
      price,
      platformFee,
      netAmount: Math.round((price - platformFee) * 100) / 100,
    };
  }, [form.price]);

  useEffect(() => {
    let active = true;
    const targetLanguage = i18n.language.split('-')[0];
    if (!isSupportedLanguage(targetLanguage) || targetLanguage === 'en') {
      const resetTimeout = setTimeout(() => {
        if (active) {
          setTranslatedTextByKey({});
        }
      }, 0);
      return () => {
        active = false;
        clearTimeout(resetTimeout);
      };
    }

    const items: { key: string; text: string }[] = [];
    const pushItem = (key: string, text: unknown): void => {
      const trimmed = normalizeDynamicText(text);
      if (!trimmed || trimmed === 'Current location') return;
      items.push({ key, text: trimmed });
    };

    pushItem('serviceName', serviceName);
    pushItem('pickupAddress', pickupAddress);
    pushItem('dropoffAddress', dropoffAddress);

    if (!items.length) {
      const resetTimeout = setTimeout(() => {
        if (active) {
          setTranslatedTextByKey({});
        }
      }, 0);
      return () => {
        active = false;
        clearTimeout(resetTimeout);
      };
    }

    void translateDynamicBatch({
      items,
      targetLanguage: targetLanguage as AppLanguage,
    }).then((translations) => {
      if (active) {
        setTranslatedTextByKey(translations);
      }
    }).catch(() => {
      if (active) {
        setTranslatedTextByKey({});
      }
    });

    return () => {
      active = false;
    };
  }, [dropoffAddress, i18n.language, pickupAddress, serviceName]);

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
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 32 + keyboardInset } : undefined,
          ]}
          keyboardShouldPersistTaps="handled"
        >
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
            {serviceName ? (
              <Text style={styles.valueText}>
                {t('Service')}: {translatedTextByKey.serviceName || serviceName}
              </Text>
            ) : null}
            {pickupAddress ? (
              <Text style={styles.valueText}>
                {t('Pickup')}: {translatedTextByKey.pickupAddress || formatDisplayAddress(pickupAddress, t)}
              </Text>
            ) : null}
            {dropoffAddress ? (
              <Text style={styles.valueText}>
                {t('Dropoff')}: {translatedTextByKey.dropoffAddress || formatDisplayAddress(dropoffAddress, t)}
              </Text>
            ) : null}
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
            <View style={styles.derivedCurrencyCard}>
              <Text style={styles.derivedCurrencyValue}>{offerCurrency}</Text>
              <Text style={styles.derivedCurrencyHint}>
                {driverCountryLabel
                  ? t('Offer currency follows your country: {{country}}.', {
                      country: driverCountryLabel,
                    })
                  : t('Offer currency follows your saved country.')}
              </Text>
            </View>

            {offerEarningsPreview ? (
              <View style={styles.earningsPreview}>
                <View style={styles.earningsPreviewHeader}>
                  <Text style={styles.earningsPreviewTitle}>{t('Your earnings')}</Text>
                  <Text style={styles.earningsPreviewPercentage}>
                    {t('{{percentage}}% platform fee', { percentage: PLATFORM_FEE_PERCENTAGE })}
                  </Text>
                </View>
                <View style={styles.earningsRow}>
                  <Text style={styles.earningsLabel}>{t('Your offer')}</Text>
                  <Text style={styles.earningsValue}>
                    {formatOfferAmount(offerEarningsPreview.price, offerCurrency)}
                  </Text>
                </View>
                <View style={styles.earningsRow}>
                  <Text style={styles.earningsLabel}>
                    {t('Platform fee ({{percentage}}%)', { percentage: PLATFORM_FEE_PERCENTAGE })}
                  </Text>
                  <Text style={styles.feeValue}>
                    -{formatOfferAmount(offerEarningsPreview.platformFee, offerCurrency)}
                  </Text>
                </View>
                <View style={styles.earningsDivider} />
                <View style={styles.earningsRow}>
                  <Text style={styles.netAmountLabel}>{t('You receive')}</Text>
                  <Text style={styles.netAmountValue}>
                    {formatOfferAmount(offerEarningsPreview.netAmount, offerCurrency)}
                  </Text>
                </View>
                <Text style={styles.earningsHint}>
                  {t('{{percentage}}% is deducted from your offer after the customer accepts it.', {
                    percentage: PLATFORM_FEE_PERCENTAGE,
                  })}
                </Text>
              </View>
            ) : null}

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
  container: { flex: 1, backgroundColor: '#F7F8F9' },
  content: { padding: 20, paddingBottom: 32, gap: 14 },
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '700', color: '#202020' },
  subtitle: { color: '#707A8C' },
  helperText: { color: '#707A8C', fontSize: 13 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#202020' },
  valueText: { color: '#505A6A', fontSize: 14 },
  label: { color: '#202020', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#202020',
  },
  messageInput: { minHeight: 100 },
  derivedCurrencyCard: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  derivedCurrencyValue: { color: '#202020', fontWeight: '800', fontSize: 18 },
  derivedCurrencyHint: { color: '#707A8C', fontSize: 13, marginTop: 4 },
  earningsPreview: {
    borderWidth: 1,
    borderColor: '#F2D37A',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FFF9E8',
    gap: 9,
  },
  earningsPreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  earningsPreviewTitle: { color: '#202020', fontSize: 16, fontWeight: '800' },
  earningsPreviewPercentage: { color: '#7A5A00', fontSize: 12, fontWeight: '700' },
  earningsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  earningsLabel: { color: '#505A6A', fontSize: 14 },
  earningsValue: { color: '#202020', fontSize: 14, fontWeight: '700' },
  feeValue: { color: '#B45309', fontSize: 14, fontWeight: '800' },
  earningsDivider: { height: 1, backgroundColor: '#F2D37A' },
  netAmountLabel: { color: '#202020', fontSize: 15, fontWeight: '800' },
  netAmountValue: { color: '#087968', fontSize: 19, fontWeight: '900' },
  earningsHint: { color: '#707A8C', fontSize: 12, lineHeight: 18, marginTop: 2 },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFF9E6',
    justifyContent: 'center',
  },
  backButtonText: { color: '#F1B900', fontWeight: '700' },
  submitButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#FFC515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#171717', fontWeight: '800', fontSize: 15 },
  loadingText: { color: '#707A8C', textAlign: 'center' },
  errorText: { color: '#B91C1C', fontSize: 13 },
});
