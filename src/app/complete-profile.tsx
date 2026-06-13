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

function normalizeDateValue(value: string): Date {
  if (!value) return new Date();
  return new Date(value);
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
    fullNameOnId: '',
    idOrResidencyNumber: '',
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
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState<boolean>(false);
  const [activeDateField, setActiveDateField] = useState<'dateOfBirth' | null>(null);
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
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      phone: profile.phone ?? '',
      countryCode: profile.countryCode ?? '',
      city: profile.city ?? '',
      fullNameOnId: profile.fullNameOnId ?? '',
      idOrResidencyNumber: '',
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
    void persistLastOnboardingRoute('/complete-profile');
  }, []);

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
  }, [driver?.fullNameOnId, driver?.idOrResidencyNumberMasked, form]);

  const isFormValid = Object.keys(fieldErrors).length === 0;

  const onChange = <K extends keyof CompleteDriverProfileForm>(
    key: K,
    value: CompleteDriverProfileForm[K],
  ): void => {
    hasUserEditedRef.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onContinue = async (): Promise<void> => {
    setHasAttemptedSubmit(true);

    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError('');

    const payload: UpdateDriverProfilePayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      countryCode: form.countryCode.trim() || undefined,
      city: form.city.trim() || undefined,
      fullNameOnId: form.fullNameOnId.trim() || undefined,
      idOrResidencyNumber: form.idOrResidencyNumber.trim() || undefined,
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

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} placeholder="First name" value={form.firstName} onChangeText={(value) => onChange('firstName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.firstName ? <Text style={styles.errorText}>{fieldErrors.firstName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} placeholder="Last name" value={form.lastName} onChangeText={(value) => onChange('lastName', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.lastName ? <Text style={styles.errorText}>{fieldErrors.lastName}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => onChange('phone', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.phone ? <Text style={styles.errorText}>{fieldErrors.phone}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Country Code</Text>
          <TextInput style={styles.input} placeholder="Country code" value={form.countryCode} onChangeText={(value) => onChange('countryCode', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.countryCode ? <Text style={styles.errorText}>{fieldErrors.countryCode}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} placeholder="City" value={form.city} onChangeText={(value) => onChange('city', value)} />
        </View>
        {hasAttemptedSubmit && fieldErrors.city ? <Text style={styles.errorText}>{fieldErrors.city}</Text> : null}

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
          <Pressable style={styles.input} onPress={() => setActiveDateField('dateOfBirth')}>
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
          value={normalizeDateValue(form[activeDateField])}
          maximumDate={maximumDobDate}
          onValueChange={(_event, selectedDate) => {
            if (selectedDate) {
              onChange(activeDateField, selectedDate.toISOString().slice(0, 10));
            }
            setActiveDateField(null);
          }}
          onDismiss={() => setActiveDateField(null)}
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
