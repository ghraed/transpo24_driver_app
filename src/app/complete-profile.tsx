import ExpoDateTimePicker from '@expo/ui/community/datetime-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  clearLastOnboardingRoute,
  persistLastOnboardingRoute,
} from '@/lib/auth-storage';
import { nextStepToRoute } from '@/lib/onboarding-route';
import type { CompleteDriverProfileForm, UpdateDriverProfilePayload } from '@/types/auth';

const PHONE_PATTERN = /^[+0-9()\-\s]{7,20}$/;
const PREFERRED_LANGUAGES = new Set(['en', 'ar', 'de', 'fr', 'it']);
const PREFERRED_LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Arabic', value: 'ar' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
  { label: 'Italian', value: 'it' },
] as const;

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

function normalizeDateValue(value: string, fallbackDate: Date): Date {
  if (!value) return fallbackDate;
  const [year, month, day] = value.split('-').map(Number);
  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    year > 0 &&
    month > 0 &&
    day > 0
  ) {
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createTestCompleteProfileDefaults(): CompleteDriverProfileForm {
  return {
    firstName: 'Test',
    lastName: 'Driver',
    phone: '+96170123456',
    countryCode: 'LB',
    city: 'Beirut',
    fullNameOnId: 'Test Driver',
    idOrResidencyNumber: 'ID123456',
    dateOfBirth: '1995-01-01',
    addressLine1: 'Beirut Main Street',
    addressLine2: 'Building 12',
    postalCode: '1107',
    preferredLanguage: 'en',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '+96170999888',
  };
}

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { driver, refreshDriverMe, saveDriverProfile, signOut } = useAuth();
  const testDefaults = useMemo(() => createTestCompleteProfileDefaults(), []);

  const [form, setForm] = useState<CompleteDriverProfileForm>(testDefaults);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const [activeDateField, setActiveDateField] = useState<'dateOfBirth' | null>(null);
  const [activeDateValue, setActiveDateValue] = useState<Date | null>(null);
  const [isLanguageModalVisible, setIsLanguageModalVisible] = useState<boolean>(false);
  const [languageSearch, setLanguageSearch] = useState<string>('');
  const hasUserEditedRef = useRef<boolean>(false);
  const maximumDobDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date;
  }, []);

  const selectedLanguageLabel = useMemo(
    () =>
      PREFERRED_LANGUAGE_OPTIONS.find((option) => option.value === form.preferredLanguage)?.label ??
      '',
    [form.preferredLanguage],
  );

  const filteredLanguageOptions = useMemo(() => {
    const normalizedSearch = languageSearch.trim().toLowerCase();
    if (!normalizedSearch) return PREFERRED_LANGUAGE_OPTIONS;

    return PREFERRED_LANGUAGE_OPTIONS.filter(
      (option) =>
        option.label.toLowerCase().includes(normalizedSearch) ||
        option.value.toLowerCase().includes(normalizedSearch),
    );
  }, [languageSearch]);

  const applyFormFromProfile = useCallback((profile: typeof driver): void => {
    if (!profile) return;
    if (hasUserEditedRef.current) return;

    setForm({
      firstName: profile.firstName?.trim() || testDefaults.firstName,
      lastName: profile.lastName?.trim() || testDefaults.lastName,
      phone: profile.phone?.trim() || testDefaults.phone,
      countryCode: profile.countryCode?.trim() || testDefaults.countryCode,
      city: profile.city?.trim() || testDefaults.city,
      fullNameOnId: profile.fullNameOnId?.trim() || testDefaults.fullNameOnId,
      idOrResidencyNumber: profile.idOrResidencyNumberMasked?.trim()
        ? ''
        : testDefaults.idOrResidencyNumber,
      dateOfBirth: toDateOnly(profile.dateOfBirth) || testDefaults.dateOfBirth,
      addressLine1: profile.addressLine1?.trim() || testDefaults.addressLine1,
      addressLine2: profile.addressLine2?.trim() || testDefaults.addressLine2,
      postalCode: profile.postalCode?.trim() || testDefaults.postalCode,
      preferredLanguage: profile.preferredLanguage?.trim() || testDefaults.preferredLanguage,
      emergencyContactName:
        profile.emergencyContactName?.trim() || testDefaults.emergencyContactName,
      emergencyContactPhone:
        profile.emergencyContactPhone?.trim() || testDefaults.emergencyContactPhone,
    });
  }, [testDefaults]);

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
    void persistLastOnboardingRoute('/complete-profile');
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<keyof CompleteDriverProfileForm, string>> = {};

    if (!form.fullNameOnId.trim() && !(driver?.fullNameOnId?.trim())) {
      errors.fullNameOnId = 'Full name on ID is required.';
    }
    if (!form.idOrResidencyNumber.trim() && !(driver?.idOrResidencyNumberMasked?.trim())) {
      errors.idOrResidencyNumber = 'ID or residency number is required.';
    }

    if (!form.dateOfBirth.trim()) {
      errors.dateOfBirth = 'Date of birth is required.';
    } else {
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
  }, [
    driver?.fullNameOnId,
    driver?.idOrResidencyNumberMasked,
    form,
  ]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof CompleteDriverProfileForm>(
    key: K,
    value: CompleteDriverProfileForm[K],
  ): void => {
    hasUserEditedRef.current = true;
    setSubmitError('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openDatePicker = useCallback(
    (field: 'dateOfBirth') => {
      setActiveDateField(field);
      setActiveDateValue(normalizeDateValue(form[field], maximumDobDate));
    },
    [form, maximumDobDate],
  );

  const closeDatePicker = useCallback(() => {
    setActiveDateField(null);
    setActiveDateValue(null);
  }, []);

  const onContinue = async (): Promise<void> => {
    setHasAttemptedSubmit(true);

    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: UpdateDriverProfilePayload = {
      firstName: driver?.firstName?.trim() || form.firstName.trim(),
      lastName: driver?.lastName?.trim() || form.lastName.trim(),
      phone: driver?.phone?.trim() || form.phone.trim(),
      countryCode: driver?.countryCode?.trim() || undefined,
      city: driver?.city?.trim() || undefined,
      fullNameOnId: form.fullNameOnId.trim() || undefined,
      idOrResidencyNumber: form.idOrResidencyNumber.trim() || undefined,
      dateOfBirth: form.dateOfBirth.trim() || undefined,
      addressLine1: form.addressLine1.trim() || undefined,
      addressLine2: form.addressLine2.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      emergencyContactName: form.emergencyContactName.trim() || undefined,
      emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
      profilePhotoUrl: undefined,
    };

    try {
      const response = await saveDriverProfile(payload);

      if (response.nextStep === 'COMPLETE_PROFILE') {
        setSubmitError('Complete the required fields highlighted below.');
        return;
      }

      if (response.nextStep === 'HOME') {
        await clearLastOnboardingRoute();
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

      if (normalized.includes('already in use') && normalized.includes('phone')) {
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
          <Pressable style={styles.backButton} onPress={() => router.replace('/register')}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.progress}>Step 1 of 3: Profile</Text>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Add your details so we can verify and prepare your driver account.
          </Text>
          <Text style={styles.helper}>
            Your profile information helps us verify your account and assign suitable transport requests.
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name On ID</Text>
          <TextInput
            style={styles.input}
            placeholder="Full name on ID"
            value={form.fullNameOnId}
            onChangeText={(value) => onChange('fullNameOnId', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.fullNameOnId ? <Text style={styles.errorText}>{fieldErrors.fullNameOnId}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>ID Or Residency Number</Text>
          <TextInput
            style={styles.input}
            placeholder="ID or residency number"
            value={form.idOrResidencyNumber}
            onChangeText={(value) => onChange('idOrResidencyNumber', value)}
          />
        </View>
        {hasAttemptedSubmit && fieldErrors.idOrResidencyNumber ? <Text style={styles.errorText}>{fieldErrors.idOrResidencyNumber}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date Of Birth</Text>
          <Pressable style={styles.input} onPress={() => openDatePicker('dateOfBirth')}>
            <Text style={form.dateOfBirth ? styles.inputText : styles.placeholderText}>
              {form.dateOfBirth || 'Select date of birth'}
            </Text>
          </Pressable>
        </View>
        {hasAttemptedSubmit && fieldErrors.dateOfBirth ? <Text style={styles.errorText}>{fieldErrors.dateOfBirth}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address Line 1</Text>
          <TextInput style={styles.input} placeholder="Address line 1" value={form.addressLine1} onChangeText={(value) => onChange('addressLine1', value)} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Address Line 2</Text>
          <TextInput style={styles.input} placeholder="Address line 2" value={form.addressLine2} onChangeText={(value) => onChange('addressLine2', value)} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Postal Code</Text>
          <TextInput style={styles.input} placeholder="Postal code" value={form.postalCode} onChangeText={(value) => onChange('postalCode', value)} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Preferred Language</Text>
          <Pressable
            style={styles.input}
            onPress={() => {
              setLanguageSearch('');
              setIsLanguageModalVisible(true);
            }}
          >
            <Text style={selectedLanguageLabel ? styles.inputText : styles.placeholderText}>
              {selectedLanguageLabel || 'Select preferred language'}
            </Text>
          </Pressable>
        </View>
        {hasAttemptedSubmit && fieldErrors.preferredLanguage ? <Text style={styles.errorText}>{fieldErrors.preferredLanguage}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Emergency Contact Name</Text>
          <TextInput style={styles.input} placeholder="Emergency contact name" value={form.emergencyContactName} onChangeText={(value) => onChange('emergencyContactName', value)} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Emergency Contact Phone</Text>
          <TextInput style={styles.input} placeholder="Emergency contact phone" keyboardType="phone-pad" value={form.emergencyContactPhone} onChangeText={(value) => onChange('emergencyContactPhone', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.emergencyContactPhone ? <Text style={styles.errorText}>{fieldErrors.emergencyContactPhone}</Text> : null}

        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, isSaving && styles.continueButtonDisabled]}
          disabled={isSaving}
          onPress={() => void onContinue()}
        >
          {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.continueButtonText}>Continue to Vehicle & Documents</Text>}
        </Pressable>

        {isSaving ? <Text style={styles.savingText}>Saving profile...</Text> : null}
      </ScrollView>
      <Modal
        visible={isLanguageModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsLanguageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setIsLanguageModalVisible(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Preferred Language</Text>
              <Pressable onPress={() => setIsLanguageModalVisible(false)}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search language"
              placeholderTextColor="#94A3B8"
              value={languageSearch}
              onChangeText={setLanguageSearch}
            />

            <ScrollView contentContainerStyle={styles.selectorList}>
              {filteredLanguageOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={styles.selectorOption}
                  onPress={() => {
                    onChange('preferredLanguage', option.value);
                    setIsLanguageModalVisible(false);
                  }}
                >
                  <Text style={styles.selectorOptionText}>{option.label}</Text>
                </Pressable>
              ))}
              {filteredLanguageOptions.length === 0 ? (
                <Text style={styles.emptySelectorText}>No matching options found.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {activeDateField ? (
        <ExpoDateTimePicker
          mode="date"
          presentation="dialog"
          value={activeDateValue ?? maximumDobDate}
          maximumDate={maximumDobDate}
          onValueChange={(_event, selectedDate) => {
            const field = activeDateField;
            if (selectedDate) {
              setActiveDateValue(selectedDate);
              onChange(field, formatDateOnly(selectedDate));
            }
            closeDatePicker();
          }}
          onDismiss={closeDatePicker}
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
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputText: {
    color: '#0F172A',
    fontSize: 15,
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: 15,
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
