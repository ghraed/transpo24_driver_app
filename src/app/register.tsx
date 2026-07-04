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

import { useAuth } from '@/context/auth-context';
import { clearLastOnboardingRoute } from '@/lib/auth-storage';
import { COUNTRY_OPTIONS } from '@/lib/country-city-options';
import { nextStepToRoute } from '@/lib/onboarding-route';
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
  const { registerNewDriver } = useAuth();

  const [form, setForm] = useState<RegisterFormState>(() => createTestRegisterDefaults());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const [activeSelectorField, setActiveSelectorField] = useState<SelectorField | null>(null);
  const [selectorSearch, setSelectorSearch] = useState<string>('');

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof RegisterFormState, string>> = {};

    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    else if (!isValidEmail(form.email.trim())) errors.email = 'Enter a valid email.';
    if (!form.phone.trim()) errors.phone = 'Phone is required.';
    if (!form.password) errors.password = 'Password is required.';
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword) errors.confirmPassword = 'Confirm your password.';
    else if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    if (form.countryCodes.length === 0) errors.countryCodes = 'At least one country is required.';
    if (form.cities.length === 0) errors.cities = 'At least one city is required.';

    return errors;
  }, [form]);

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

  const citySelectorOptions = useMemo(
    () => {
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
    },
    [selectedCountries],
  );

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
      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }
      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      if (message.toLowerCase().includes('email')) {
        setSubmitError('This email is already in use. Try logging in.');
      } else if (message.toLowerCase().includes('phone')) {
        setSubmitError('This phone number is already in use.');
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
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Join Transpo24 as a Driver</Text>
          <Text style={styles.subtitle}>
            Create your account and start receiving transport requests.
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} placeholder="First name" placeholderTextColor="#94A3B8" value={form.firstName} onChangeText={(value) => onChange('firstName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.firstName ? <Text style={styles.errorText}>{fieldErrors.firstName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} placeholder="Last name" placeholderTextColor="#94A3B8" value={form.lastName} onChangeText={(value) => onChange('lastName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.lastName ? <Text style={styles.errorText}>{fieldErrors.lastName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(value) => onChange('email', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="Phone"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(value) => onChange('phone', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={form.password}
            onChangeText={(value) => onChange('password', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={form.confirmPassword}
            onChangeText={(value) => onChange('confirmPassword', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.confirmPassword ? <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Countries</Text>
          <Pressable style={styles.selectorField} onPress={() => openSelector('country')}>
            <Text
              style={[
                styles.selectorValue,
                selectedCountries.length === 0 && styles.selectorPlaceholder,
              ]}
            >
              {selectedCountries.length
                ? selectedCountries.map((country) => country.label).join(', ')
                : 'Select countries'}
            </Text>
          </Pressable>
          {selectedCountries.length ? (
            <View style={styles.countryChipRow}>
              {selectedCountries.map((country) => (
                <View key={country.code} style={styles.countryChip}>
                  <Text style={styles.countryChipText}>{country.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {hasAttemptedSubmit && fieldErrors.countryCodes ? <Text style={styles.errorText}>{fieldErrors.countryCodes}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Cities</Text>
          <Pressable
            style={[
              styles.selectorField,
              selectedCountries.length === 0 && styles.selectorFieldDisabled,
            ]}
            onPress={() => openSelector('city')}
            disabled={selectedCountries.length === 0}
          >
            <Text
              style={[
                styles.selectorValue,
                form.cities.length === 0 && styles.selectorPlaceholder,
              ]}
            >
              {form.cities.length
                ? form.cities.join(', ')
                : selectedCountries.length > 0
                  ? 'Select cities'
                  : 'Choose countries first'}
            </Text>
          </Pressable>
          {form.cities.length ? (
            <View style={styles.countryChipRow}>
              {form.cities.map((city) => (
                <View key={city} style={styles.countryChip}>
                  <Text style={styles.countryChipText}>{city}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {hasAttemptedSubmit && fieldErrors.cities ? <Text style={styles.errorText}>{fieldErrors.cities}</Text> : null}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          disabled={isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Create Driver Account</Text>
          )}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          Already have an account? Login
        </Link>
      </ScrollView>
      <Modal
        visible={Boolean(activeSelectorField)}
        animationType="slide"
        transparent
        onRequestClose={closeSelector}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeSelector} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeSelectorField === 'country' ? 'Select countries' : 'Select cities'}
              </Text>
              <Pressable onPress={closeSelector}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor="#94A3B8"
              value={selectorSearch}
              onChangeText={setSelectorSearch}
            />

            <ScrollView contentContainerStyle={styles.selectorList}>
              {filteredSelectorOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={styles.selectorOption}
                  onPress={() => {
                    if (activeSelectorField === 'country') {
                      onToggleCountry(option.value);
                    } else {
                      onToggleCity(option.value);
                    }
                  }}
                >
                  <Text style={styles.selectorOptionText}>
                    {activeSelectorField === 'country'
                      ? form.countryCodes.includes(option.value)
                        ? `✓ ${option.label}`
                        : option.label
                      : form.cities.includes(option.value)
                        ? `✓ ${option.label}`
                        : option.label}
                  </Text>
                </Pressable>
              ))}
              {filteredSelectorOptions.length === 0 ? (
                <Text style={styles.emptySelectorText}>No matching options found.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 4,
  },
  backButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
    fontSize: 14,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    color: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  selectorField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  selectorFieldDisabled: {
    backgroundColor: '#F8FAFC',
  },
  selectorValue: {
    color: '#0F172A',
    fontSize: 15,
  },
  selectorPlaceholder: {
    color: '#94A3B8',
  },
  countryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countryChip: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countryChipText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    marginTop: -2,
    marginBottom: 2,
    color: '#DC2626',
    fontSize: 12,
  },
  submitButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  linkText: {
    marginTop: 14,
    textAlign: 'center',
    color: '#1D4ED8',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#0F172A',
    fontSize: 15,
  },
  selectorList: {
    gap: 8,
    paddingBottom: 12,
  },
  selectorOption: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  selectorOptionText: {
    color: '#0F172A',
    fontSize: 15,
  },
  emptySelectorText: {
    textAlign: 'center',
    color: '#64748B',
    paddingVertical: 16,
  },
});
