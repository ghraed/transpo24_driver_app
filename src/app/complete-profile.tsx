import { useRouter } from 'expo-router';
import ExpoDateTimePicker from '@expo/ui/community/datetime-picker';
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

import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/context/auth-context';
import { getDriverRouteForNextStep, normalizeDriverNextStep } from '@/lib/driver-onboarding';
import type {
  DriverOnboardingResponse,
  DriverPersonalInfoForm,
  PreferredLanguage,
  UpdateDriverProfilePayload,
} from '@/types/auth';

function toDateOnly(isoDate: string | null | undefined): string {
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

const PREFERRED_LANGUAGE_OPTIONS: Array<{ label: string; value: PreferredLanguage }> = [
  { label: 'English', value: 'en' },
  { label: 'Arabic', value: 'ar' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Italian', value: 'it' },
];
const PERSONAL_INFO_TEST_DEFAULTS: DriverPersonalInfoForm = {
  fullNameOnId: 'Test Driver Account',
  dateOfBirth: '1995-05-15',
  idOrResidencyNumber: 'DRV-12345678',
  addressLine1: 'Hamra Main Street',
  addressLine2: 'Building 12, Floor 3',
  postalCode: '1103',
  preferredLanguages: ['en', 'ar'],
  emergencyContactName: 'Test Emergency Contact',
  emergencyContactPhone: '+96170002000',
};

function formatSelectedLanguagesLabel(values: PreferredLanguage[]): string | undefined {
  if (values.length === 0) return undefined;

  const labels = PREFERRED_LANGUAGE_OPTIONS.filter((option) =>
    values.includes(option.value),
  ).map((option) => option.label);

  if (labels.length <= 2) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { driver, refreshDriverMe, refreshDriverOnboarding, saveDriverProfile, signOut } =
    useAuth();

  const [form, setForm] = useState<DriverPersonalInfoForm>({
    ...PERSONAL_INFO_TEST_DEFAULTS,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [currentTimeMs] = useState<number>(() => Date.now());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState<boolean>(false);
  const hasUserEditedRef = useRef<boolean>(false);
  const hasDriver = Boolean(driver);
  const preferredLanguagesKey = (driver?.preferredLanguages ?? []).join('|');

  const applyFormFromSources = useCallback((
    onboarding?: DriverOnboardingResponse | null,
  ): void => {
    if (hasUserEditedRef.current) return;

    const derivedFullName =
      onboarding?.fullNameOnId?.trim() ||
      `${driver?.firstName ?? ''} ${driver?.lastName ?? ''}`.trim() ||
      PERSONAL_INFO_TEST_DEFAULTS.fullNameOnId;
    setForm({
      fullNameOnId: derivedFullName,
      dateOfBirth:
        toDateOnly(onboarding?.dateOfBirth ?? driver?.dateOfBirth) ||
        PERSONAL_INFO_TEST_DEFAULTS.dateOfBirth,
      idOrResidencyNumber: PERSONAL_INFO_TEST_DEFAULTS.idOrResidencyNumber,
      addressLine1: driver?.addressLine1 ?? PERSONAL_INFO_TEST_DEFAULTS.addressLine1,
      addressLine2: driver?.addressLine2 ?? PERSONAL_INFO_TEST_DEFAULTS.addressLine2,
      postalCode: driver?.postalCode ?? PERSONAL_INFO_TEST_DEFAULTS.postalCode,
      preferredLanguages:
        driver?.preferredLanguages?.length
          ? [...driver.preferredLanguages]
          : [...PERSONAL_INFO_TEST_DEFAULTS.preferredLanguages],
      emergencyContactName:
        driver?.emergencyContactName ?? PERSONAL_INFO_TEST_DEFAULTS.emergencyContactName,
      emergencyContactPhone:
        driver?.emergencyContactPhone ?? PERSONAL_INFO_TEST_DEFAULTS.emergencyContactPhone,
    });
  }, [
    driver?.addressLine1,
    driver?.addressLine2,
    driver?.dateOfBirth,
    driver?.emergencyContactName,
    driver?.emergencyContactPhone,
    driver?.firstName,
    driver?.lastName,
    driver?.postalCode,
    preferredLanguagesKey,
  ]);

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const me = await refreshDriverMe();
      const nextStep = normalizeDriverNextStep(me.nextStep);
      if (nextStep !== 'COMPLETE_PROFILE') {
        router.replace(getDriverRouteForNextStep(nextStep));
        return;
      }
      applyFormFromSources();
    } catch (error) {
      try {
        const response = await refreshDriverOnboarding();
        const nextStep = normalizeDriverNextStep(response.nextStep);
        if (nextStep !== 'COMPLETE_PROFILE') {
          router.replace(getDriverRouteForNextStep(nextStep));
          return;
        }
        applyFormFromSources(response);
      } catch {
        if (hasDriver) {
          applyFormFromSources();
        } else {
          const message = error instanceof Error ? error.message : 'Failed to load profile.';
          setLoadError(message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyFormFromSources, hasDriver, refreshDriverMe, refreshDriverOnboarding, router]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadProfile]);

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof DriverPersonalInfoForm, string>> = {};

    if (!form.fullNameOnId.trim()) {
      errors.fullNameOnId = 'Full name as shown on ID is required.';
    }

    if (!form.dateOfBirth.trim()) {
      errors.dateOfBirth = 'Date of birth is required.';
    } else {
      const parsed = new Date(form.dateOfBirth.trim());
      if (Number.isNaN(parsed.getTime())) {
        errors.dateOfBirth = 'Date of birth must be a valid date (YYYY-MM-DD).';
      } else if (parsed.getTime() > currentTimeMs) {
        errors.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (!isAtLeast18(form.dateOfBirth.trim())) {
        errors.dateOfBirth = 'Driver must be at least 18 years old.';
      }
    }

    if (!form.idOrResidencyNumber.trim()) {
      errors.idOrResidencyNumber = 'ID or residency number is required.';
    }

    if (!form.addressLine1.trim()) {
      errors.addressLine1 = 'Address line 1 is required.';
    }

    if (!form.postalCode.trim()) {
      errors.postalCode = 'Postal code is required.';
    }

    if (form.preferredLanguages.length === 0) {
      errors.preferredLanguages = 'Select at least one preferred language.';
    }

    if (!form.emergencyContactName.trim()) {
      errors.emergencyContactName = 'Emergency contact name is required.';
    }

    if (!form.emergencyContactPhone.trim()) {
      errors.emergencyContactPhone = 'Emergency contact phone is required.';
    }

    return errors;
  }, [currentTimeMs, form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof DriverPersonalInfoForm>(
    key: K,
    value: DriverPersonalInfoForm[K],
  ): void => {
    hasUserEditedRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const datePickerValue = useMemo(() => {
    const parsed = form.dateOfBirth ? new Date(form.dateOfBirth) : new Date('2000-01-01');
    return Number.isNaN(parsed.getTime()) ? new Date('2000-01-01') : parsed;
  }, [form.dateOfBirth]);

  const preferredLanguageOptions = useMemo(
    () =>
      PREFERRED_LANGUAGE_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );

  const onPreferredLanguageSelect = (value: string): void => {
    const nextValue = value as PreferredLanguage;
    onChange(
      'preferredLanguages',
      form.preferredLanguages.includes(nextValue)
        ? form.preferredLanguages.filter((item) => item !== nextValue)
        : [...form.preferredLanguages, nextValue],
    );
  };

  const maximumDate = useMemo(() => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today;
  }, []);

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: UpdateDriverProfilePayload = {
      firstName: driver?.firstName?.trim() || 'Driver',
      lastName: driver?.lastName?.trim() || 'Account',
      phone: driver?.phone?.trim() || '',
      countryCode: driver?.countryCode ?? undefined,
      city: driver?.city ?? undefined,
      fullNameOnId: form.fullNameOnId.trim(),
      dateOfBirth: form.dateOfBirth.trim(),
      idOrResidencyNumber: form.idOrResidencyNumber.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || undefined,
      postalCode: form.postalCode.trim(),
      preferredLanguages: form.preferredLanguages,
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactPhone: form.emergencyContactPhone.trim(),
    };

    try {
      const response = await saveDriverProfile(payload);
      const nextStep = normalizeDriverNextStep(response.nextStep);

      if (nextStep === 'COMPLETE_PROFILE') {
        setSubmitError('Some required fields are still missing. Please complete your profile.');
        return;
      }

      router.replace(getDriverRouteForNextStep(nextStep));
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

      if (normalized.includes('id or residency')) {
        setSubmitError('This ID or residency number is already in use.');
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
          <Text style={styles.progress}>Step 1 of 2: Personal Info</Text>
          <Text style={styles.title}>Driver Registration</Text>
          <Text style={styles.subtitle}>
            Enter your personal information as shown on your official documents.
          </Text>
          <Text style={styles.helper}>
            Add the ID details and contact information needed before document upload.
          </Text>
        </View>

        <Text style={styles.label}>Full name as shown on ID</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name as shown on ID"
          value={form.fullNameOnId}
          onChangeText={(value) => onChange('fullNameOnId', value)}
        />
        {fieldErrors.fullNameOnId ? (
          <Text style={styles.errorText}>{fieldErrors.fullNameOnId}</Text>
        ) : null}

        <Text style={styles.label}>Date of birth</Text>
        <Pressable
          style={styles.selectTrigger}
          onPress={() => setIsDatePickerVisible(true)}
        >
          <Text style={form.dateOfBirth ? styles.selectValueText : styles.selectPlaceholderText}>
            {form.dateOfBirth || 'Select date of birth'}
          </Text>
          <Text style={styles.selectChevron}>▼</Text>
        </Pressable>
        {fieldErrors.dateOfBirth ? <Text style={styles.errorText}>{fieldErrors.dateOfBirth}</Text> : null}

        <Text style={styles.label}>ID or residency number</Text>
        <TextInput
          style={styles.input}
          placeholder="ID or residency number"
          autoCapitalize="characters"
          value={form.idOrResidencyNumber}
          onChangeText={(value) => onChange('idOrResidencyNumber', value)}
        />
        {fieldErrors.idOrResidencyNumber ? (
          <Text style={styles.errorText}>{fieldErrors.idOrResidencyNumber}</Text>
        ) : null}

        <Text style={styles.label}>Address line 1</Text>
        <TextInput
          style={styles.input}
          placeholder="Address line 1"
          value={form.addressLine1}
          onChangeText={(value) => onChange('addressLine1', value)}
        />
        {fieldErrors.addressLine1 ? (
          <Text style={styles.errorText}>{fieldErrors.addressLine1}</Text>
        ) : null}

        <Text style={styles.label}>Address line 2</Text>
        <TextInput
          style={styles.input}
          placeholder="Address line 2"
          value={form.addressLine2}
          onChangeText={(value) => onChange('addressLine2', value)}
        />

        <Text style={styles.label}>Postal code</Text>
        <TextInput
          style={styles.input}
          placeholder="Postal code"
          value={form.postalCode}
          onChangeText={(value) => onChange('postalCode', value)}
        />
        {fieldErrors.postalCode ? (
          <Text style={styles.errorText}>{fieldErrors.postalCode}</Text>
        ) : null}

        <Text style={styles.label}>Preferred languages</Text>
        <SearchableSelect
          emptyMessage="No languages found."
          multiple
          onSelect={onPreferredLanguageSelect}
          options={preferredLanguageOptions}
          placeholder="Select preferred languages"
          searchPlaceholder="Search language"
          selectedLabel={formatSelectedLanguagesLabel(form.preferredLanguages)}
          selectedValues={form.preferredLanguages}
          title="Select preferred languages"
        />
        {fieldErrors.preferredLanguages ? (
          <Text style={styles.errorText}>{fieldErrors.preferredLanguages}</Text>
        ) : null}

        <Text style={styles.label}>Emergency contact name</Text>
        <TextInput
          style={styles.input}
          placeholder="Emergency contact name"
          value={form.emergencyContactName}
          onChangeText={(value) => onChange('emergencyContactName', value)}
        />
        {fieldErrors.emergencyContactName ? (
          <Text style={styles.errorText}>{fieldErrors.emergencyContactName}</Text>
        ) : null}

        <Text style={styles.label}>Emergency contact phone</Text>
        <TextInput
          style={styles.input}
          placeholder="Emergency contact phone"
          keyboardType="phone-pad"
          value={form.emergencyContactPhone}
          onChangeText={(value) => onChange('emergencyContactPhone', value)}
        />
        {fieldErrors.emergencyContactPhone ? (
          <Text style={styles.errorText}>{fieldErrors.emergencyContactPhone}</Text>
        ) : null}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, (!isFormValid || isSaving) && styles.continueButtonDisabled]}
          disabled={!isFormValid || isSaving}
          onPress={() => void onContinue()}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </Pressable>

        {isSaving ? <Text style={styles.savingText}>Saving personal info...</Text> : null}
      </ScrollView>

      {isDatePickerVisible ? (
        <ExpoDateTimePicker
          value={datePickerValue}
          mode="date"
          maximumDate={maximumDate}
          presentation={Platform.OS === 'android' ? 'dialog' : undefined}
          onDismiss={() => setIsDatePickerVisible(false)}
          onValueChange={(_, selectedDate) => {
            setIsDatePickerVisible(false);
            onChange('dateOfBirth', toDateOnly(selectedDate.toISOString()));
          }}
        />
      ) : null}
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
    color: '#0F172A',
  },
  multilineInput: {
    minHeight: 96,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginBottom: -2,
  },
  selectTrigger: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  selectValueText: {
    color: '#0F172A',
    fontSize: 15,
    flex: 1,
  },
  selectPlaceholderText: {
    color: '#94A3B8',
    fontSize: 15,
    flex: 1,
  },
  selectChevron: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 12,
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
