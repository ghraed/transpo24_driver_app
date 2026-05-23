import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { useAuth } from '@/context/auth-context';
import type { CompleteDriverProfileForm, DriverNextStep, UpdateDriverProfilePayload } from '@/types/auth';

const PHONE_PATTERN = /^[+0-9()\-\s]{7,20}$/;
const PREFERRED_LANGUAGES = new Set(['en', 'ar', 'de', 'fr', 'it']);

function nextStepToRoute(
  nextStep: DriverNextStep,
): '/complete-profile' | '/vehicle-documents' | '/set-availability' | '/waiting-approval' | '/driver-home' {
  switch (nextStep) {
    case 'COMPLETE_PROFILE':
      return '/complete-profile';
    case 'ADD_VEHICLE_DOCUMENTS':
      return '/vehicle-documents';
    case 'SET_AVAILABILITY':
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/driver-home';
  }
}

function toDateOnly(isoDate: string | null): string {
  if (!isoDate) return '';
  return isoDate.slice(0, 10);
}

function isAtLeast18(dateValue: string): boolean {
  const dob = new Date(dateValue);
  if (Number.isNaN(dob.getTime())) return false;

  const adult = new Date(dob);
  adult.setFullYear(adult.getFullYear() + 18);

  return adult.getTime() <= Date.now();
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { driver, refreshDriverMe, saveDriverProfile, signOut } = useAuth();

  const [form, setForm] = useState<CompleteDriverProfileForm>({
    firstName: '',
    lastName: '',
    phone: '',
    countryCode: '',
    city: '',
    dateOfBirth: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    preferredLanguage: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const hasUserEditedRef = useRef<boolean>(false);

  const applyFormFromProfile = useCallback((profile: typeof driver): void => {
    if (!profile) return;
    if (hasUserEditedRef.current) return;

    setForm({
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      countryCode: profile.countryCode ?? '',
      city: profile.city ?? '',
      dateOfBirth: toDateOnly(profile.dateOfBirth),
      addressLine1: profile.addressLine1 ?? '',
      addressLine2: profile.addressLine2 ?? '',
      postalCode: profile.postalCode ?? '',
      preferredLanguage: profile.preferredLanguage ?? '',
      emergencyContactName: profile.emergencyContactName ?? '',
      emergencyContactPhone: profile.emergencyContactPhone ?? '',
    });
  }, []);

  const loadProfile = useCallback(async (): Promise<void> => {
    if (driver) {
      applyFormFromProfile(driver);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setLoadError('');

    try {
      const response = await refreshDriverMe();
      applyFormFromProfile(response.driver);
    } catch (error) {
      if (driver) {
        applyFormFromProfile(driver);
      } else {
        const message = error instanceof Error ? error.message : 'Failed to load profile.';
        setLoadError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyFormFromProfile, driver, refreshDriverMe]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof CompleteDriverProfileForm, string>> = {};

    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.phone.trim()) errors.phone = 'Phone is required.';
    else if (!PHONE_PATTERN.test(form.phone.trim())) errors.phone = 'Enter a valid phone number.';

    if (!form.countryCode.trim()) errors.countryCode = 'Country code is required.';
    if (!form.city.trim()) errors.city = 'City is required.';

    if (form.dateOfBirth.trim()) {
      const parsed = new Date(form.dateOfBirth.trim());
      if (Number.isNaN(parsed.getTime())) {
        errors.dateOfBirth = 'Date of birth must be a valid date (YYYY-MM-DD).';
      } else if (!isAtLeast18(form.dateOfBirth.trim())) {
        errors.dateOfBirth = 'Driver must be at least 18 years old.';
      }
    }

    if (form.emergencyContactPhone.trim() && !PHONE_PATTERN.test(form.emergencyContactPhone.trim())) {
      errors.emergencyContactPhone = 'Enter a valid emergency contact phone.';
    }

    if (
      form.preferredLanguage.trim() &&
      !PREFERRED_LANGUAGES.has(form.preferredLanguage.trim().toLowerCase())
    ) {
      errors.preferredLanguage = 'Preferred language must be one of: en, ar, de, fr, it.';
    }

    return errors;
  }, [form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof CompleteDriverProfileForm>(
    key: K,
    value: CompleteDriverProfileForm[K],
  ): void => {
    hasUserEditedRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: UpdateDriverProfilePayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      countryCode: form.countryCode.trim() || undefined,
      city: form.city.trim() || undefined,
      dateOfBirth: form.dateOfBirth.trim() || undefined,
      addressLine1: form.addressLine1.trim() || undefined,
      addressLine2: form.addressLine2.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      preferredLanguage: form.preferredLanguage.trim()
        ? (form.preferredLanguage.trim().toLowerCase() as UpdateDriverProfilePayload['preferredLanguage'])
        : undefined,
      emergencyContactName: form.emergencyContactName.trim() || undefined,
      emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
      profilePhotoUrl: undefined,
    };

    try {
      const response = await saveDriverProfile(payload);

      if (response.nextStep === 'COMPLETE_PROFILE') {
        setSubmitError('Some required fields are still missing. Please complete your profile.');
        return;
      }

      router.replace(nextStepToRoute(response.nextStep));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save profile.';
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

      if (normalized.includes('phone')) {
        setSubmitError('This phone number is already in use.');
      } else if (normalized.includes('18')) {
        setSubmitError('Driver must be at least 18 years old.');
      } else {
        setSubmitError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadProfile()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.progress}>Step 1 of 3: Profile</Text>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Add your details so we can verify and prepare your driver account.
          </Text>
          <Text style={styles.helper}>
            Your profile information helps us verify your account and assign suitable transport requests.
          </Text>
        </View>

        <TextInput style={styles.input} placeholder="First name" value={form.firstName} onChangeText={(value) => onChange('firstName', value)} />
        {fieldErrors.firstName ? <Text style={styles.errorText}>{fieldErrors.firstName}</Text> : null}

        <TextInput style={styles.input} placeholder="Last name" value={form.lastName} onChangeText={(value) => onChange('lastName', value)} />
        {fieldErrors.lastName ? <Text style={styles.errorText}>{fieldErrors.lastName}</Text> : null}

        <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => onChange('phone', value)} />
        {fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}

        <TextInput style={styles.input} placeholder="Country code" value={form.countryCode} onChangeText={(value) => onChange('countryCode', value)} />
        {fieldErrors.countryCode ? <Text style={styles.errorText}>{fieldErrors.countryCode}</Text> : null}

        <TextInput style={styles.input} placeholder="City" value={form.city} onChangeText={(value) => onChange('city', value)} />
        {fieldErrors.city ? <Text style={styles.errorText}>{fieldErrors.city}</Text> : null}

        <TextInput style={styles.input} placeholder="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={(value) => onChange('dateOfBirth', value)} />
        {fieldErrors.dateOfBirth ? <Text style={styles.errorText}>{fieldErrors.dateOfBirth}</Text> : null}

        <TextInput style={styles.input} placeholder="Address line 1" value={form.addressLine1} onChangeText={(value) => onChange('addressLine1', value)} />
        <TextInput style={styles.input} placeholder="Address line 2" value={form.addressLine2} onChangeText={(value) => onChange('addressLine2', value)} />
        <TextInput style={styles.input} placeholder="Postal code" value={form.postalCode} onChangeText={(value) => onChange('postalCode', value)} />
        <TextInput style={styles.input} placeholder="Preferred language (en, ar, de, fr, it)" autoCapitalize="none" value={form.preferredLanguage} onChangeText={(value) => onChange('preferredLanguage', value)} />
        {fieldErrors.preferredLanguage ? <Text style={styles.errorText}>{fieldErrors.preferredLanguage}</Text> : null}
        <TextInput style={styles.input} placeholder="Emergency contact name" value={form.emergencyContactName} onChangeText={(value) => onChange('emergencyContactName', value)} />

        <TextInput style={styles.input} placeholder="Emergency contact phone" keyboardType="phone-pad" value={form.emergencyContactPhone} onChangeText={(value) => onChange('emergencyContactPhone', value)} />
        {fieldErrors.emergencyContactPhone ? <Text style={styles.errorText}>{fieldErrors.emergencyContactPhone}</Text> : null}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, (!isFormValid || isSaving) && styles.continueButtonDisabled]}
          disabled={!isFormValid || isSaving}
          onPress={() => void onContinue()}
        >
          {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.continueButtonText}>Continue to Vehicle & Documents</Text>}
        </Pressable>

        {isSaving ? <Text style={styles.savingText}>Saving profile...</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    color: '#475569',
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
  progress: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 2,
    color: '#475569',
    fontSize: 14,
  },
  helper: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorText: {
    marginTop: -2,
    marginBottom: 2,
    color: '#DC2626',
    fontSize: 12,
  },
  continueButton: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  savingText: {
    marginTop: 4,
    textAlign: 'center',
    color: '#475569',
  },
  retryButton: {
    borderRadius: 10,
    minHeight: 44,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
