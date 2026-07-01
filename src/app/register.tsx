import { Link, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/context/auth-context';
import {
  clearDriverRegisterDraft,
  persistDriverRegisterDraft,
  readDriverRegisterDraft,
} from '@/lib/auth-storage';
import { getDriverRouteForNextStep } from '@/lib/driver-onboarding';
import { COUNTRY_OPTIONS, getFlagEmoji } from '@/lib/locations';
import type { RegisterDriverPayload } from '@/types/auth';

interface RegisterFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  countryCodes: string[];
  city: string;
}

const TEST_REGISTER_FORM: RegisterFormState = {
  firstName: 'Test',
  lastName: 'Driver',
  email: 'driver.test+mobile@transpo24.local',
  phone: '+96170123456',
  password: 'TestPass123',
  confirmPassword: 'TestPass123',
  countryCodes: ['LB'],
  city: 'Beirut',
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function DriverRegisterScreen() {
  const router = useRouter();
  const { registerNewDriver } = useAuth();

  const [form, setForm] = useState<RegisterFormState>(TEST_REGISTER_FORM);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');

  const selectedCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((country) => form.countryCodes.includes(country.code)),
    [form.countryCodes],
  );

  const countryOptions = useMemo(
    () =>
      COUNTRY_OPTIONS.map((country) => ({
        label: `${getFlagEmoji(country.code)}  ${country.name} (${country.code})`,
        value: country.code,
      })),
    [],
  );

  const cityOptions = useMemo(
    () => {
      const uniqueCities = Array.from(
        new Set(selectedCountries.flatMap((country) => country.cities)),
      );

      return uniqueCities.map((city) => ({
        label: city,
        value: city,
      }));
    },
    [selectedCountries],
  );

  const selectedCountryLabel = useMemo(() => {
    if (!selectedCountries.length) return undefined;

    return selectedCountries
      .map((country) => `${getFlagEmoji(country.code)}  ${country.name} (${country.code})`)
      .join(', ');
  }, [selectedCountries]);

  const selectedCountryNames = useMemo(
    () => selectedCountries.map((country) => country.name).join(', '),
    [selectedCountries],
  );

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

    return errors;
  }, [form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof RegisterFormState>(key: K, value: RegisterFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onCountrySelect = (countryCode: string) => {
    setForm((prev) => {
      const countryCodes = prev.countryCodes.includes(countryCode)
        ? prev.countryCodes.filter((value) => value !== countryCode)
        : [...prev.countryCodes, countryCode];
      const nextCountries = COUNTRY_OPTIONS.filter((country) => countryCodes.includes(country.code));
      const allowedCities = new Set(nextCountries.flatMap((country) => country.cities));
      const canKeepCity = allowedCities.has(prev.city);
      return {
        ...prev,
        countryCodes,
        city: canKeepCity ? prev.city : '',
      };
    });
  };

  useEffect(() => {
    let isMounted = true;

    const loadDraft = async (): Promise<void> => {
      const draft = await readDriverRegisterDraft();
      if (!draft || !isMounted) return;

      setForm({
        firstName: draft.firstName || TEST_REGISTER_FORM.firstName,
        lastName: draft.lastName || TEST_REGISTER_FORM.lastName,
        email: draft.email || TEST_REGISTER_FORM.email,
        phone: draft.phone || TEST_REGISTER_FORM.phone,
        password: draft.password || TEST_REGISTER_FORM.password,
        confirmPassword: draft.confirmPassword || TEST_REGISTER_FORM.confirmPassword,
        countryCodes: draft.countryCodes.length ? draft.countryCodes : TEST_REGISTER_FORM.countryCodes,
        city: draft.city || TEST_REGISTER_FORM.city,
      });
    };

    void loadDraft();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    void persistDriverRegisterDraft(form);
  }, [form]);

  const onSubmit = async (): Promise<void> => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    const payload: RegisterDriverPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      password: form.password,
      countryCode: form.countryCodes[0]?.trim() || undefined,
      city: form.city.trim() || undefined,
    };

    try {
      const nextStep = await registerNewDriver(payload);
      await clearDriverRegisterDraft();
      router.replace(getDriverRouteForNextStep(nextStep));
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
          <Text style={styles.title}>Driver Registration</Text>
          <Text style={styles.subtitle}>
            Create a driver account or continue with your existing customer account details.
          </Text>
          <Text style={styles.helper}>
            Your phone number is verified through WhatsApp before driver onboarding is completed.
          </Text>
        </View>

        <Text style={styles.label}>First name</Text>
        <TextInput style={styles.input} placeholder="First name" value={form.firstName} onChangeText={(value) => onChange('firstName', value)} />
        {fieldErrors.firstName ? <Text style={styles.errorText}>{fieldErrors.firstName}</Text> : null}

        <Text style={styles.label}>Last name</Text>
        <TextInput style={styles.input} placeholder="Last name" value={form.lastName} onChangeText={(value) => onChange('lastName', value)} />
        {fieldErrors.lastName ? <Text style={styles.errorText}>{fieldErrors.lastName}</Text> : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(value) => onChange('email', value)}
        />
        {fieldErrors.email ? <Text style={styles.errorText}>{fieldErrors.email}</Text> : null}

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="Phone"
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(value) => onChange('phone', value)}
        />
        {fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={form.password}
          onChangeText={(value) => onChange('password', value)}
        />
        {fieldErrors.password ? <Text style={styles.errorText}>{fieldErrors.password}</Text> : null}

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          secureTextEntry
          value={form.confirmPassword}
          onChangeText={(value) => onChange('confirmPassword', value)}
        />
        {fieldErrors.confirmPassword ? <Text style={styles.errorText}>{fieldErrors.confirmPassword}</Text> : null}

        <Text style={styles.label}>Country code</Text>
        <SearchableSelect
          emptyMessage="No countries found."
          multiSelect
          onSelect={onCountrySelect}
          options={countryOptions}
          placeholder="Select countries (optional)"
          searchPlaceholder="Search country"
          selectedLabel={selectedCountryLabel}
          selectedValues={form.countryCodes}
          title="Select countries"
        />

        <Text style={styles.label}>City</Text>
        <SearchableSelect
          disabled={!selectedCountries.length}
          emptyMessage={selectedCountries.length ? 'No cities found.' : 'Select at least one country first.'}
          onSelect={(city) => onChange('city', city)}
          options={cityOptions}
          placeholder={selectedCountries.length ? 'Select city (optional)' : 'Select country first'}
          searchPlaceholder="Search city"
          selectedLabel={form.city || undefined}
          title={selectedCountries.length ? `Select city in ${selectedCountryNames}` : 'Select city'}
        />

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.submitButton, (!isFormValid || isSubmitting) && styles.submitButtonDisabled]}
          disabled={!isFormValid || isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Continue</Text>
          )}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          Already have an account? Login
        </Link>
      </ScrollView>
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
    gap: 4,
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
  helper: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: -2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
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
});
