import { Link, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/auth-context';
import { clearLastOnboardingRoute } from '@/lib/auth-storage';
import { COUNTRY_OPTIONS } from '@/lib/country-city-options';
import { nextStepToRoute } from '@/lib/onboarding-route';
import { registerDriverPushNotifications } from '@/notifications/registerPushNotifications';
import type { RegisterDriverPayload } from '@/types/auth';

interface RegisterFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  countryCodes: string[];
  cities: string[];
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type SelectorField = 'country' | 'city';

function createTestRegisterDefaults(): RegisterFormState {
  const seed = Date.now().toString().slice(-6);

  return {
    firstName: 'Test',
    lastName: 'Driver',
    email: `driver.${seed}@test.com`,
    phone: `701${seed}`,
    password: 'driver@test.com',
    confirmPassword: 'driver@test.com',
    countryCodes: ['LB'],
    cities: ['Beirut'],
  };
}

export default function DriverRegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { registerNewDriver } = useAuth();

  const [form, setForm] = useState<RegisterFormState>(() => createTestRegisterDefaults());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [activeSelectorField, setActiveSelectorField] = useState<SelectorField | null>(null);
  const [selectorSearch, setSelectorSearch] = useState('');

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof RegisterFormState, string>> = {};

    if (!form.firstName.trim()) errors.firstName = t('First name is required.');
    if (!form.lastName.trim()) errors.lastName = t('Last name is required.');
    if (!form.email.trim()) errors.email = t('Email is required.');
    else if (!isValidEmail(form.email.trim())) errors.email = t('Enter a valid email.');
    if (!form.phone.trim()) errors.phone = t('Phone is required.');
    if (!form.password) errors.password = t('Password is required.');
    else if (form.password.length < 8) errors.password = t('Password must be at least 8 characters.');
    if (!form.confirmPassword) errors.confirmPassword = t('Confirm your password.');
    else if (form.password !== form.confirmPassword) errors.confirmPassword = t('Passwords do not match.');
    if (form.countryCodes.length === 0) errors.countryCodes = t('At least one country is required.');
    if (form.cities.length === 0) errors.cities = t('At least one city is required.');

    return errors;
  }, [form, t]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const selectedCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((country) => form.countryCodes.includes(country.code)),
    [form.countryCodes],
  );

  const countrySelectorOptions = useMemo(
    () =>
      COUNTRY_OPTIONS.map((country) => ({
        label: country.label,
        value: country.code,
      })),
    [],
  );

  const citySelectorOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { label: string; value: string }[] = [];

    selectedCountries.forEach((country) => {
      country.cities.forEach((city) => {
        if (seen.has(city)) return;
        seen.add(city);
        options.push({
          label: city,
          value: city,
        });
      });
    });

    return options;
  }, [selectedCountries]);

  const activeSelectorOptions = useMemo(() => {
    return activeSelectorField === 'country' ? countrySelectorOptions : citySelectorOptions;
  }, [activeSelectorField, countrySelectorOptions, citySelectorOptions]);

  const filteredSelectorOptions = useMemo(() => {
    const normalizedSearch = selectorSearch.trim().toLowerCase();
    if (!normalizedSearch) return activeSelectorOptions;

    return activeSelectorOptions.filter((option) =>
      option.label.toLowerCase().includes(normalizedSearch),
    );
  }, [activeSelectorOptions, selectorSearch]);

  const onChange = <K extends keyof RegisterFormState>(key: K, value: RegisterFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openSelector = (field: SelectorField): void => {
    if (field === 'city' && selectedCountries.length === 0) return;
    setActiveSelectorField(field);
    setSelectorSearch('');
  };

  const closeSelector = (): void => {
    setActiveSelectorField(null);
    setSelectorSearch('');
  };

  const onToggleCountry = (value: string): void => {
    setForm((prev) => {
      const nextCountryCodes = prev.countryCodes.includes(value)
        ? prev.countryCodes.filter((countryCode) => countryCode !== value)
        : [...prev.countryCodes, value];

      const allowedCities = new Set(
        COUNTRY_OPTIONS
          .filter((country) => nextCountryCodes.includes(country.code))
          .flatMap((country) => country.cities),
      );

      return {
        ...prev,
        countryCodes: nextCountryCodes,
        cities: prev.cities.filter((city) => allowedCities.has(city)),
      };
    });
  };

  const onToggleCity = (value: string): void => {
    setForm((prev) => ({
      ...prev,
      cities: prev.cities.includes(value)
        ? prev.cities.filter((city) => city !== value)
        : [...prev.cities, value],
    }));
  };

  const onSubmit = async (): Promise<void> => {
    setHasAttemptedSubmit(true);
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    const payload: RegisterDriverPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      password: form.password,
      countryCode: form.countryCodes[0] || undefined,
      countryCodes: form.countryCodes.length ? form.countryCodes : undefined,
      city: form.cities[0] || undefined,
      cities: form.cities.length ? form.cities : undefined,
    };

    try {
      const response = await registerNewDriver(payload);

      try {
        await registerDriverPushNotifications();
      } catch (pushError) {
        console.warn('Driver push registration failed after registration.', pushError);
      }

      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }
      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Registration failed.');
      if (message.toLowerCase().includes('email')) {
        setSubmitError(t('This email is already in use. Try logging in.'));
      } else if (message.toLowerCase().includes('phone')) {
        setSubmitError(t('This phone number is already in use.'));
      } else {
        setSubmitError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('Join Transpo24 as a Driver')}</Text>
          <Text style={styles.subtitle}>
            {t('Create your account and start receiving transport requests.')}
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('First Name')}</Text>
          <TextInput style={styles.input} placeholder={t('First Name')} placeholderTextColor="#94A3B8" value={form.firstName} onChangeText={(value) => onChange('firstName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.firstName ? <Text style={styles.errorText}>{fieldErrors.firstName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Last Name')}</Text>
          <TextInput style={styles.input} placeholder={t('Last Name')} placeholderTextColor="#94A3B8" value={form.lastName} onChangeText={(value) => onChange('lastName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.lastName ? <Text style={styles.errorText}>{fieldErrors.lastName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Email')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('Email')}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(value) => onChange('email', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Phone')}</Text>
          <TextInput style={styles.input} placeholder={t('Phone')} placeholderTextColor="#94A3B8" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => onChange('phone', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Password')}</Text>
          <TextInput style={styles.input} placeholder={t('Password')} placeholderTextColor="#94A3B8" secureTextEntry value={form.password} onChangeText={(value) => onChange('password', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Confirm your password.')}</Text>
          <TextInput style={styles.input} placeholder={t('Confirm your password.')} placeholderTextColor="#94A3B8" secureTextEntry value={form.confirmPassword} onChangeText={(value) => onChange('confirmPassword', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.confirmPassword ? <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Country')}</Text>
          <Pressable style={styles.selectorButton} onPress={() => openSelector('country')}>
            <Text style={styles.selectorButtonText}>
              {selectedCountries.length
                ? selectedCountries.map((country) => country.label).join(', ')
                : t('Country')}
            </Text>
          </Pressable>
        </View>
        {hasAttemptedSubmit && fieldErrors.countryCodes ? <Text style={styles.errorText}>{fieldErrors.countryCodes}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('City')}</Text>
          <Pressable style={styles.selectorButton} onPress={() => openSelector('city')}>
            <Text style={styles.selectorButtonText}>
              {form.cities.length ? form.cities.join(', ') : t('City')}
            </Text>
          </Pressable>
        </View>
        {hasAttemptedSubmit && fieldErrors.cities ? <Text style={styles.errorText}>{fieldErrors.cities}</Text> : null}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable style={[styles.submitButton, isSubmitting && styles.buttonDisabled]} onPress={() => void onSubmit()} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>{t('Create account')}</Text>}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          {t('Driver Login')}
        </Link>
      </ScrollView>

      <Modal transparent visible={Boolean(activeSelectorField)} animationType="slide" onRequestClose={closeSelector}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{activeSelectorField === 'country' ? t('Country') : t('City')}</Text>
            <TextInput
              style={styles.input}
              placeholder={activeSelectorField === 'country' ? t('Country') : t('City')}
              placeholderTextColor="#94A3B8"
              value={selectorSearch}
              onChangeText={setSelectorSearch}
            />
            <ScrollView contentContainerStyle={styles.selectorList}>
              {filteredSelectorOptions.map((option) => {
                const selected = activeSelectorField === 'country'
                  ? form.countryCodes.includes(option.value)
                  : form.cities.includes(option.value);

                return (
                  <Pressable
                    key={option.value}
                    style={[styles.selectorOption, selected && styles.selectorOptionSelected]}
                    onPress={() =>
                      activeSelectorField === 'country'
                        ? onToggleCountry(option.value)
                        : onToggleCity(option.value)
                    }
                  >
                    <Text style={[styles.selectorOptionText, selected && styles.selectorOptionTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.submitButton} onPress={closeSelector}>
              <Text style={styles.submitButtonText}>{t('Back')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 32 },
  header: { gap: 6, marginBottom: 16 },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  backButtonText: { color: '#0F172A', fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '700', color: '#0F172A' },
  subtitle: { color: '#475569' },
  fieldGroup: { marginTop: 12, gap: 6 },
  label: { color: '#0F172A', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#0F172A',
  },
  selectorButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  selectorButtonText: { color: '#0F172A' },
  submitButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700' },
  buttonDisabled: { opacity: 0.7 },
  linkText: { marginTop: 14, color: '#2563EB', textAlign: 'center', fontWeight: '600' },
  errorText: { marginTop: 6, color: '#B91C1C', fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 12,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  selectorList: { gap: 8 },
  selectorOption: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorOptionSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  selectorOptionText: { color: '#0F172A' },
  selectorOptionTextSelected: { color: '#1D4ED8', fontWeight: '700' },
});
