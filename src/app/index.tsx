import { Link, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginIntroGate } from '@/components/login-intro-gate';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { resetUsersForTesting, sendDriverPhoneVerificationCode } from '@/lib/api';
import { buildInternationalPhoneNumber, normalizeDialingCode } from '@/lib/phone-number';

export default function DriverLoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [dialingCode, setDialingCode] = useState('+961');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingUsers, setIsResettingUsers] = useState(false);
  const keyboardInset = useAndroidKeyboardInset();

  const onContinue = useCallback(async (): Promise<void> => {
    const normalizedPhoneNumber = buildInternationalPhoneNumber(
      dialingCode,
      phoneNumber,
    );

    if (!phoneNumber.trim()) {
      setErrorMessage(t('Phone number is required.'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await sendDriverPhoneVerificationCode({ phoneNumber: normalizedPhoneNumber });
      router.push({
        pathname: '/verify-phone',
        params: { phoneNumber: normalizedPhoneNumber },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('Unable to send the verification code.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [dialingCode, phoneNumber, router, t]);

  const onResetUsers = useCallback(async (): Promise<void> => {
    if (isResettingUsers) return;

    setIsResettingUsers(true);
    setErrorMessage('');

    try {
      const response = await resetUsersForTesting();
      setErrorMessage(
        t('Deleted {{count}} driver user(s). Kept {{email}}. Non-driver roles were not targeted.', {
          count: response.deletedUsers,
          email: response.keptEmail,
        }),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Failed to reset users.'));
    } finally {
      setIsResettingUsers(false);
    }
  }, [isResettingUsers, t]);

  return (
    <LoginIntroGate>
      <SafeAreaView
        style={[
          styles.container,
          keyboardInset > 0 ? styles.containerKeyboardOpen : undefined,
          keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : undefined,
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('Driver Login')}</Text>
          <Text style={styles.subtitle}>
            {t('Enter your mobile number and we will send you a verification code by SMS.')}
          </Text>
        </View>

        <View style={styles.phoneRow}>
          <TextInput
            style={[styles.input, styles.dialingCodeInput]}
            placeholder="+961"
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            value={dialingCode}
            onChangeText={(value) => setDialingCode(normalizeDialingCode(value))}
          />
          <TextInput
            style={[styles.input, styles.phoneInput]}
            placeholder={t('Mobile number')}
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={() => void onContinue()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>{t('Send verification code')}</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.secondaryButton, isResettingUsers && styles.buttonDisabled]}
          onPress={() => void onResetUsers()}
          disabled={isResettingUsers}
        >
          {isResettingUsers ? (
            <ActivityIndicator color="#1D4ED8" />
          ) : (
            <Text style={styles.secondaryButtonText}>
              {t('Delete Driver Users Except driver@test.com')}
            </Text>
          )}
        </Pressable>

        <Link href="/register" style={styles.linkText}>
          {t('New driver? Continue with phone verification')}
        </Link>
      </SafeAreaView>
    </LoginIntroGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24,
    justifyContent: 'center',
  },
  containerKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  header: {
    gap: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
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
    marginTop: 12,
  },
  button: {
    marginTop: 20,
    backgroundColor: '#1D4ED8',
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '700',
  },
  linkText: {
    marginTop: 24,
    alignSelf: 'center',
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '600',
  },
});
