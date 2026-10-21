import { OfferEarningsCard } from '@/components/offer-earnings-card';
import { OfferDateTimeField } from '@/components/offer-date-time-field';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { ApiResponseError, sendDriverPriceOffer } from '@/lib/api';
import { currencyForCountryCode, getCountryLabel } from '@/lib/country-currency';
import { formatDateTime } from '@/localization/format';
import { isSupportedLanguage, type AppLanguage } from '@/localization/languages';
import { getSourceErrorMessage } from '@/localization/response-message';
import { translateDynamicBatch } from '@/services/translation-service';
import type { SendDriverPriceOfferPayload } from '@/types/auth';
import { calculateDistanceMeters } from '@/utils/locationValidation';

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

const PLATFORM_FEE_PERCENTAGE = 15;

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

function parseCoordinate(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function formatRouteDistance(
  pickupLatitude: number | null,
  pickupLongitude: number | null,
  dropoffLatitude: number | null,
  dropoffLongitude: number | null,
): string | null {
  if (
    pickupLatitude === null ||
    pickupLongitude === null ||
    dropoffLatitude === null ||
    dropoffLongitude === null
  ) {
    return null;
  }

  const distanceKm = calculateDistanceMeters(
    { latitude: pickupLatitude, longitude: pickupLongitude },
    { latitude: dropoffLatitude, longitude: dropoffLongitude },
  ) / 1000;

  if (!Number.isFinite(distanceKm)) return null;
  return `${distanceKm.toFixed(distanceKm < 1 ? 2 : 1)} km`;
}

export default function SendPriceOfferScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir?.() === 'rtl';
  const rowDirection = rtl && styles.rtlRow;
  const textDirection = rtl && styles.rtlText;
  const [priceFocused, setPriceFocused] = useState(false);
  const { driver, signOut } = useAuth();
  const params = useLocalSearchParams();

  const requestId = typeof params.requestId === 'string' ? params.requestId : '';
  const requestVersion = typeof params.requestVersion === 'string' ? params.requestVersion : '';
  const serviceName = typeof params.serviceName === 'string' ? params.serviceName : '';
  const pickupAddress = typeof params.pickupAddress === 'string' ? params.pickupAddress : '';
  const dropoffAddress = typeof params.dropoffAddress === 'string' ? params.dropoffAddress : '';
  const pickupLatitude = parseCoordinate(params.pickupLatitude);
  const pickupLongitude = parseCoordinate(params.pickupLongitude);
  const dropoffLatitude = parseCoordinate(params.dropoffLatitude);
  const dropoffLongitude = parseCoordinate(params.dropoffLongitude);
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
    () => getCountryLabel(driver?.countryCode, i18n.resolvedLanguage),
    [driver?.countryCode, i18n.resolvedLanguage],
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
  const routeDistance = useMemo(
    () => formatRouteDistance(pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude),
    [dropoffLatitude, dropoffLongitude, pickupLatitude, pickupLongitude],
  );

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
      requestVersion,
      price: Number(form.price.trim()),
      currency: offerCurrency,
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
      if (error instanceof ApiResponseError && error.code === 'REQUEST_DETAILS_CHANGED') {
        router.replace({ pathname: '/review-request-details', params: { requestId } });
        Alert.alert(
          t('Request details changed'),
          t('The client changed one or more details of this job request. Review the updated details before sending an offer.'),
        );
        return;
      }
      const message = error instanceof Error ? error.message : t('Failed to send offer.');
      const normalized = getSourceErrorMessage(error, message).toLowerCase();
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
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, keyboardInset > 0 ? { paddingBottom: 32 + keyboardInset } : undefined]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.navigation, rowDirection]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} disabled={isSubmitting}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/receive-requests')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed, rowDirection]}>
              <PageIcon name={rtl ? { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' } : { ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} />
              <Text style={styles.backButtonText}>{t('Back')}</Text>
            </Pressable>
            {requestId ? <Text accessibilityLabel={`${t('Request')}: ${requestId}`} style={styles.reference}>{t('Request')} #{requestIdShort}</Text> : null}
          </View>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[styles.title, textDirection]}>{t('Send Price Offer')}</Text>
            <Text style={[styles.subtitle, textDirection]}>{t('Enter your price and timing so the customer can choose your offer.')}</Text>
          </View>

          <View style={styles.card}>
            <SectionHeading title={t('Request Summary')} icon={{ ios: 'shippingbox', android: 'local_shipping', web: 'local_shipping' }} rtl={rtl} />
            {serviceName ? <Text style={[styles.service, textDirection]}>{translatedTextByKey.serviceName || serviceName}</Text> : null}
            <View style={styles.route}>
              {[
                { label: 'Pickup', address: pickupAddress, translated: translatedTextByKey.pickupAddress },
                { label: 'Dropoff', address: dropoffAddress, translated: translatedTextByKey.dropoffAddress },
              ].map((stop, index) => <View key={stop.label} style={[styles.routeRow, rowDirection]}>
                <View style={styles.routeTrack}>
                  <View style={[styles.routeDot, index === 1 && styles.destinationDot]} />
                  {index === 0 ? <View style={styles.routeLine} /> : null}
                </View>
                <View style={[styles.routeCopy, index === 0 && styles.firstStop]}>
                  <Text style={[styles.detailLabel, textDirection]}>{t(stop.label)}</Text>
                  <Text style={[styles.detailValue, textDirection]}>{stop.translated || formatDisplayAddress(stop.address, t)}</Text>
                </View>
              </View>)}
            </View>
            <View style={styles.requestMeta}>
              <View style={[styles.metaRow, rowDirection]}>
                <PageIcon name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={16} />
                <Text style={[styles.metaText, textDirection]}>{scheduledPickupAt ? formatDateTime(scheduledPickupAt) : t('Immediate pickup')}</Text>
              </View>
              {routeDistance ? <View style={[styles.metaRow, rowDirection]}>
                <PageIcon name={{ ios: 'arrow.triangle.swap', android: 'swap_horiz', web: 'swap_horiz' }} size={16} />
                <Text style={[styles.metaText, textDirection]}>{t('Distance')}: {routeDistance}</Text>
              </View> : null}
            </View>
            {errors.requestId ? <Text accessibilityRole="alert" style={[styles.errorText, textDirection]}>{errors.requestId}</Text> : null}
            {!requestId ? <Pressable accessibilityRole="button" style={styles.returnButton} onPress={() => router.replace('/receive-requests')}>
              <Text style={styles.backButtonText}>{t('Go Back to Available Requests')}</Text>
            </Pressable> : null}
          </View>

          <View style={styles.card}>
            <SectionHeading title={t('Price Offer')} icon={{ ios: 'tag', android: 'sell', web: 'sell' }} rtl={rtl} />
            <Text style={[styles.label, textDirection]}>{t('Price *')}</Text>
            <View style={[styles.priceField, priceFocused && styles.focused, errors.price && styles.invalid, rowDirection]}>
              <TextInput
                accessibilityLabel={t('Price *')}
                style={[styles.priceInput, rtl && styles.priceInputRtl]}
                value={form.price}
                onChangeText={(price) => { setForm((prev) => ({ ...prev, price })); setErrors((prev) => ({ ...prev, price: undefined })); }}
                onFocus={() => setPriceFocused(true)} onBlur={() => setPriceFocused(false)}
                placeholder="0.00" placeholderTextColor="#8A95A5" keyboardType="decimal-pad" editable={!isSubmitting}
              />
              <View style={styles.currencyBadge}><Text style={styles.currencyText}>{offerCurrency}</Text></View>
            </View>
            {errors.price ? <Text accessibilityRole="alert" style={[styles.errorText, textDirection]}>{errors.price}</Text> : null}
            <Text style={[styles.helperText, textDirection]}>
              {driverCountryLabel ? t('Offer currency follows your country: {{country}}.', { country: driverCountryLabel }) : t('Offer currency follows your saved country.')}
            </Text>
          </View>

          <OfferEarningsCard preview={offerEarningsPreview} currency={offerCurrency} platformFeePercentage={PLATFORM_FEE_PERCENTAGE} />

          <View style={styles.card}>
            <SectionHeading title={t('Offer timing')} icon={{ ios: 'clock', android: 'schedule', web: 'schedule' }} rtl={rtl} />
            <Text style={[styles.helperText, textDirection]}>{t('Add your estimated pickup and delivery times. These details are optional.')}</Text>
            <OfferDateTimeField label={t('Estimated pickup date/time (optional)')} value={form.estimatedPickupAt}
              onChange={(estimatedPickupAt) => { setForm((prev) => ({ ...prev, estimatedPickupAt })); setErrors((prev) => ({ ...prev, estimatedPickupAt: undefined })); }}
              error={errors.estimatedPickupAt} disabled={isSubmitting} minimumDate={new Date()} />
            <OfferDateTimeField label={t('Estimated delivery date/time (optional)')} value={form.estimatedDeliveryAt}
              onChange={(estimatedDeliveryAt) => { setForm((prev) => ({ ...prev, estimatedDeliveryAt })); setErrors((prev) => ({ ...prev, estimatedDeliveryAt: undefined })); }}
              error={errors.estimatedDeliveryAt} disabled={isSubmitting} minimumDate={parseOptionalIsoDate(form.estimatedPickupAt) ?? new Date()} />
            <Text style={[styles.label, textDirection]}>{t('Estimated duration (minutes)')}</Text>
            <TextInput accessibilityLabel={t('Estimated duration (minutes)')} style={[styles.input, errors.estimatedDurationMinutes && styles.invalid, textDirection]}
              value={form.estimatedDurationMinutes} onChangeText={(estimatedDurationMinutes) => setForm((prev) => ({ ...prev, estimatedDurationMinutes }))}
              placeholder="120" placeholderTextColor="#8A95A5" keyboardType="number-pad" editable={!isSubmitting} />
            {errors.estimatedDurationMinutes ? <Text accessibilityRole="alert" style={[styles.errorText, textDirection]}>{errors.estimatedDurationMinutes}</Text> : null}
          </View>

          <View style={styles.card}>
            <SectionHeading title={t('Message (optional)')} icon={{ ios: 'text.bubble', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }} rtl={rtl} />
            <TextInput accessibilityLabel={t('Message (optional)')} style={[styles.input, styles.messageInput, textDirection]}
              value={form.message} onChangeText={(message) => setForm((prev) => ({ ...prev, message }))}
              placeholder={t('Message (optional)')} placeholderTextColor="#8A95A5" multiline textAlignVertical="top" maxLength={1000} editable={!isSubmitting} />
            <Text style={[styles.characterCount, rtl && styles.countRtl]}>{form.message.length} / 1000</Text>
            {errors.message ? <Text accessibilityRole="alert" style={[styles.errorText, textDirection]}>{errors.message}</Text> : null}
          </View>

          {submitError ? <Text accessibilityRole="alert" style={[styles.errorText, textDirection]}>{submitError}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Submit Offer')}
            style={({ pressed }) => [styles.submitButton, isSubmitting && styles.disabled, pressed && styles.pressed, rowDirection]}
            onPress={() => void onSubmit()} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator color="#17212F" /> : <PageIcon name={{ ios: 'paperplane', android: 'send', web: 'send' }} color="#17212F" />}
            <Text style={styles.submitButtonText}>{t(isSubmitting ? 'Sending offer...' : 'Submit Offer')}</Text>
          </Pressable>
          <Text style={[styles.footerHint, textDirection]}>{t('The customer will compare offers and choose the best driver.')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PageIcon({ name, size = 18, color = '#5B6778' }: { name: SymbolViewProps['name']; size?: number; color?: string }) {
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SymbolView name={name} size={size} tintColor={color} /></View>;
}

function SectionHeading({ title, icon, rtl }: { title: string; icon: SymbolViewProps['name']; rtl: boolean }) {
  return <View style={[styles.sectionHeader, rtl && styles.rtlRow]}>
    <View style={styles.sectionIcon}><PageIcon name={icon} color="#17212F" size={19} /></View>
    <Text accessibilityRole="header" style={[styles.sectionTitle, rtl && styles.rtlText]}>{title}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FB' },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 16 },
  navigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  backButton: { minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', paddingEnd: 8 },
  backButtonText: { color: '#17212F', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  reference: { flexShrink: 1, color: '#5B6778', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  header: { gap: 8, paddingBottom: 6 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5, color: '#17212F' },
  subtitle: { color: '#5B6778', fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#E4E9EF', padding: 20, gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFF2CC', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, color: '#17212F', fontSize: 16, lineHeight: 22, fontWeight: '700' },
  service: { color: '#17212F', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  route: { paddingTop: 4 },
  routeRow: { flexDirection: 'row', gap: 12 },
  routeTrack: { width: 10, alignSelf: 'stretch', alignItems: 'center' },
  routeDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#B78C22', backgroundColor: '#FFF2CC', marginTop: 4 },
  destinationDot: { borderColor: '#5B6778', backgroundColor: '#E4E9EF' },
  routeLine: { width: 1, backgroundColor: '#E4E9EF', position: 'absolute', top: 14, bottom: -4 },
  routeCopy: { flex: 1, minWidth: 0 },
  firstStop: { paddingBottom: 18 },
  detailLabel: { fontSize: 12, lineHeight: 17, color: '#5B6778' },
  detailValue: { marginTop: 3, fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#17212F' },
  requestMeta: { borderTopWidth: 1, borderTopColor: '#E4E9EF', paddingTop: 14, gap: 10 },
  metaRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  metaText: { flex: 1, color: '#5B6778', fontSize: 13, lineHeight: 19 },
  label: { color: '#17212F', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#DAE1E9', borderRadius: 12, padding: 14, backgroundColor: '#FAFBFC', color: '#17212F', fontSize: 16 },
  priceField: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76, borderWidth: 1, borderColor: '#DAE1E9', borderRadius: 14, paddingHorizontal: 16, backgroundColor: '#FAFBFC' },
  priceInput: { flex: 1, minWidth: 0, paddingVertical: 16, fontSize: 30, lineHeight: 38, fontWeight: '600', color: '#17212F', writingDirection: 'ltr' },
  priceInputRtl: { textAlign: 'right' },
  currencyBadge: { borderRadius: 8, backgroundColor: '#EDF0F4', paddingHorizontal: 10, paddingVertical: 6 },
  currencyText: { color: '#5B6778', fontSize: 12, lineHeight: 16, fontWeight: '700', writingDirection: 'ltr' },
  helperText: { color: '#5B6778', fontSize: 13, lineHeight: 19 },
  focused: { borderColor: '#B78C22', backgroundColor: '#FFFFFF' },
  invalid: { borderColor: '#B91C1C' },
  messageInput: { minHeight: 112 },
  characterCount: { color: '#5B6778', fontSize: 12, textAlign: 'right', writingDirection: 'ltr' },
  countRtl: { textAlign: 'left' },
  returnButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#FFF2CC', padding: 12 },
  submitButton: { flexDirection: 'row', gap: 10, minHeight: 56, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, backgroundColor: '#FFC548', alignItems: 'center', justifyContent: 'center' },
  submitButtonText: { flexShrink: 1, textAlign: 'center', color: '#17212F', fontSize: 16, lineHeight: 22, fontWeight: '700' },
  footerHint: { textAlign: 'center', color: '#5B6778', fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  errorText: { color: '#B91C1C', fontSize: 13, lineHeight: 19 },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
