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
import { COUNTRY_OPTIONS } from '@/lib/locations';
import type {
  DriverCoverageAreaSelection,
  DriverOnboardingResponse,
  DriverPersonalInfoForm,
  DriverPersonalInfoPayload,
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

function parseCoverageAreas(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { driver, refreshDriverOnboarding, saveDriverPersonalInfo, signOut } = useAuth();

  const [form, setForm] = useState<DriverPersonalInfoForm>({
    fullNameOnId: '',
    dateOfBirth: '',
    idOrResidencyNumber: '',
    coverageCity: '',
    coverageAreasInput: '',
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [currentTimeMs] = useState<number>(() => Date.now());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState<boolean>(false);
  const hasUserEditedRef = useRef<boolean>(false);

  const applyFormFromSources = useCallback((
    onboarding?: DriverOnboardingResponse | null,
  ): void => {
    if (hasUserEditedRef.current) return;

    const derivedFullName =
      onboarding?.fullNameOnId?.trim() ||
      `${driver?.firstName ?? ''} ${driver?.lastName ?? ''}`.trim();
    setForm({
      fullNameOnId: derivedFullName,
      dateOfBirth: toDateOnly(onboarding?.dateOfBirth ?? driver?.dateOfBirth),
      idOrResidencyNumber: '',
      coverageCity: onboarding?.coverageCity ?? driver?.city ?? '',
      coverageAreasInput:
        onboarding?.coverageAreas.join(', ') ?? driver?.coverageAreas.join(', ') ?? '',
    });
  }, [driver?.city, driver?.coverageAreas, driver?.dateOfBirth, driver?.firstName, driver?.lastName]);

  const coverageAreas = useMemo(() => parseCoverageAreas(form.coverageAreasInput), [
    form.coverageAreasInput,
  ]);

  const coverageSelection = useMemo<DriverCoverageAreaSelection>(
    () => ({
      coverageCity: form.coverageCity.trim() || undefined,
      coverageAreas: coverageAreas.length > 0 ? coverageAreas : undefined,
    }),
    [coverageAreas, form.coverageCity],
  );

  const driverCountryCode = driver?.countryCode ?? null;
  const cityOptions = useMemo(() => {
    const matchingCountry = driverCountryCode
      ? COUNTRY_OPTIONS.find((country) => country.code === driverCountryCode)
      : null;
    const sourceCities =
      matchingCountry?.cities.length
        ? matchingCountry.cities
        : COUNTRY_OPTIONS.flatMap((country) => country.cities);

    return Array.from(new Set(sourceCities)).map((city) => ({
      label: city,
      value: city,
    }));
  }, [driverCountryCode]);

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await refreshDriverOnboarding();
      const nextStep = normalizeDriverNextStep(response.nextStep);
      if (nextStep !== 'COMPLETE_PROFILE') {
        router.replace(getDriverRouteForNextStep(nextStep));
        return;
      }
      applyFormFromSources(response);
    } catch (error) {
      if (driver) {
        applyFormFromSources();
      } else {
        const message = error instanceof Error ? error.message : 'Failed to load profile.';
        setLoadError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [applyFormFromSources, driver, refreshDriverOnboarding, router]);

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

    if (
      !coverageSelection.coverageCity?.trim() &&
      (coverageSelection.coverageAreas?.length ?? 0) === 0
    ) {
      errors.coverageAreasInput = 'Select at least one city or covered area.';
    }
    return errors;
  }, [coverageSelection, currentTimeMs, form]);

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

  const maximumDate = useMemo(() => {
    const today = new Date();
    today.setFullYear(today.getFullYear() - 18);
    return today;
  }, []);

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: DriverPersonalInfoPayload = {
      fullNameOnId: form.fullNameOnId.trim(),
      dateOfBirth: form.dateOfBirth.trim(),
      idOrResidencyNumber: form.idOrResidencyNumber.trim(),
      coverageCity: coverageSelection.coverageCity,
      coverageAreas: coverageSelection.coverageAreas,
    };

    try {
      const response = await saveDriverPersonalInfo(payload);
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
            Add the ID details and service coverage needed before document upload.
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

        <Text style={styles.label}>City or covered areas</Text>
        <SearchableSelect
          emptyMessage="No cities found."
          onSelect={(value) => onChange('coverageCity', value)}
          options={cityOptions}
          placeholder="Select city"
          searchPlaceholder="Search city"
          selectedLabel={form.coverageCity || undefined}
          title="Select city"
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Additional covered areas, separated by commas"
          multiline
          textAlignVertical="top"
          value={form.coverageAreasInput}
          onChangeText={(value) => onChange('coverageAreasInput', value)}
        />
        <Text style={styles.helper}>
          Add one or more areas separated by commas if you cover more than the selected city.
        </Text>
        {fieldErrors.coverageAreasInput ? (
          <Text style={styles.errorText}>{fieldErrors.coverageAreasInput}</Text>
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
