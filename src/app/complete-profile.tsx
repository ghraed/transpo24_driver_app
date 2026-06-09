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
import { getDriverRouteForNextStep, normalizeDriverNextStep } from '@/lib/driver-onboarding';
import type {
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
  const hasUserEditedRef = useRef<boolean>(false);

  const applyFormFromSources = useCallback((
    onboarding?: DriverOnboardingResponse | null,
  ): void => {
    if (hasUserEditedRef.current) return;

    const derivedFullName =
      onboarding?.fullNameOnId?.trim() ||
      `${driver?.firstName ?? ''} ${driver?.lastName ?? ''}`.trim();
    const coverageAreas = onboarding?.coverageAreas?.join(', ') ?? driver?.coverageAreas?.join(', ') ?? '';

    setForm({
      fullNameOnId: derivedFullName,
      dateOfBirth: toDateOnly(onboarding?.dateOfBirth ?? driver?.dateOfBirth),
      idOrResidencyNumber: '',
      coverageCity: onboarding?.coverageCity ?? driver?.city ?? '',
      coverageAreasInput: coverageAreas,
    });
  }, [driver?.city, driver?.coverageAreas, driver?.dateOfBirth, driver?.firstName, driver?.lastName]);

  const loadProfile = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await refreshDriverOnboarding();
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
  }, [applyFormFromSources, driver, refreshDriverOnboarding]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadProfile]);

  const normalizedCoverageAreas = useMemo(
    () =>
      form.coverageAreasInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [form.coverageAreasInput],
  );

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

    if (!form.coverageCity.trim() && normalizedCoverageAreas.length === 0) {
      errors.coverageAreasInput = 'Select at least one coverage city or area.';
    }

    return errors;
  }, [currentTimeMs, form, normalizedCoverageAreas]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof DriverPersonalInfoForm>(
    key: K,
    value: DriverPersonalInfoForm[K],
  ): void => {
    hasUserEditedRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onContinue = async (): Promise<void> => {
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: DriverPersonalInfoPayload = {
      fullNameOnId: form.fullNameOnId.trim(),
      dateOfBirth: form.dateOfBirth.trim(),
      idOrResidencyNumber: form.idOrResidencyNumber.trim(),
      coverageCity: form.coverageCity.trim() || undefined,
      coverageAreas:
        normalizedCoverageAreas.length > 0 ? normalizedCoverageAreas : undefined,
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
      } else if (normalized.includes('coverage')) {
        setSubmitError('Select at least one city or coverage area.');
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
          <Text style={styles.title}>Complete Your Driver Profile</Text>
          <Text style={styles.subtitle}>
            Add the ID details and coverage areas needed before document upload.
          </Text>
          <Text style={styles.helper}>
            This step saves the personal information used for verification and onboarding.
          </Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Full name as shown on ID"
          value={form.fullNameOnId}
          onChangeText={(value) => onChange('fullNameOnId', value)}
        />
        {fieldErrors.fullNameOnId ? (
          <Text style={styles.errorText}>{fieldErrors.fullNameOnId}</Text>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Date of birth (YYYY-MM-DD)"
          value={form.dateOfBirth}
          onChangeText={(value) => onChange('dateOfBirth', value)}
        />
        {fieldErrors.dateOfBirth ? <Text style={styles.errorText}>{fieldErrors.dateOfBirth}</Text> : null}

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

        <TextInput
          style={styles.input}
          placeholder="Coverage city"
          value={form.coverageCity}
          onChangeText={(value) => onChange('coverageCity', value)}
        />

        <TextInput
          style={[styles.input, styles.multilineInput]}
          placeholder="Coverage areas (comma separated)"
          multiline
          value={form.coverageAreasInput}
          onChangeText={(value) => onChange('coverageAreasInput', value)}
        />
        <Text style={styles.helperInline}>
          Add one or more service areas separated by commas if the driver covers multiple zones.
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
            <Text style={styles.continueButtonText}>Continue to Document Upload</Text>
          )}
        </Pressable>

        {isSaving ? <Text style={styles.savingText}>Saving personal info...</Text> : null}
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
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  errorText: {
    marginTop: -2,
    marginBottom: 2,
    color: '#DC2626',
    fontSize: 12,
  },
  helperInline: {
    marginTop: -2,
    marginBottom: 4,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
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
