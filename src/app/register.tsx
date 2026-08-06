import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import { useTranslation } from 'react-i18next';

import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { sendDriverPhoneVerificationCode } from '@/lib/api';
import { buildInternationalPhoneNumber, normalizeDialingCode } from '@/lib/phone-number';

export default function DriverRegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const keyboardInset = useAndroidKeyboardInset();
  const [dialingCode, setDialingCode] = useState('+961');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const fieldError = !phoneNumber.trim()
    ? t('Phone number is required.')
    : '';

  const onSubmit = useCallback(async (): Promise<void> => {
    const normalizedPhoneNumber = buildInternationalPhoneNumber(
      dialingCode,
      phoneNumber,
    );
    setHasAttemptedSubmit(true);

    if (!phoneNumber.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await sendDriverPhoneVerificationCode({ phoneNumber: normalizedPhoneNumber });
      router.replace({
        pathname: '/verify-phone',
        params: { phoneNumber: normalizedPhoneNumber },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('Unable to send the verification code.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [dialingCode, isSubmitting, phoneNumber, router, t]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          keyboardInset > 0 ? { paddingBottom: 28 + keyboardInset } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
            <Text style={styles.backButtonText}>{t('Back')}</Text>
          </Pressable>
          <Text style={styles.progress}>{t('Step 0 of 3: Verify Mobile')}</Text>
          <Text style={styles.title}>{t('Create Driver Account')}</Text>
          <Text style={styles.subtitle}>
            {t('Start with your mobile number. After SMS verification, you will continue the usual driver onboarding flow.')}
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('Mobile Number')}</Text>
          <View style={styles.phoneRow}>
            <TextInput
              style={[styles.input, styles.dialingCodeInput]}
              placeholder="+961"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={dialingCode}
              onChangeText={(value) => setDialingCode(normalizeDialingCode(value))}
            />
            <TextInput
              style={[styles.input, styles.phoneInput]}
              placeholder={t('Mobile number')}
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </View>
        </View>

        {hasAttemptedSubmit && fieldError ? (
          <Text style={styles.errorText}>{fieldError}</Text>
        ) : null}
        {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

        <Pressable
          style={[styles.continueButton, isSubmitting && styles.continueButtonDisabled]}
          disabled={isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueButtonText}>
              {t('Send verification code')}
            </Text>
          )}
        </Pressable>
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
    gap: 10,
    marginBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },
  progress: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  fieldGroup: {
    gap: 8,
    marginTop: 12,
  },
  label: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dialingCodeInput: {
    width: 104,
  },
  phoneInput: {
    flex: 1,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    marginTop: 4,
  },
  continueButton: {
    minHeight: 52,
    marginTop: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
