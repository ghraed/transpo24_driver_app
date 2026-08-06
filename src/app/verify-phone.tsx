import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  clearLastOnboardingRoute,
  readLastOnboardingRoute,
} from '@/lib/auth-storage';
import { sendDriverPhoneVerificationCode } from '@/lib/api';
import { resolveDriverEntryRoute } from '@/lib/onboarding-route';
import { getResendSecondsRemaining, normalizeOtpCode } from '@/lib/otp';
import { maskPhoneNumber } from '@/lib/phone-number';
import { registerDriverPushNotifications } from '@/notifications/registerPushNotifications';

const RESEND_SECONDS = 60;

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { phoneNumber: rawPhoneNumber } = useLocalSearchParams<{
    phoneNumber?: string;
  }>();
  const phoneNumber = typeof rawPhoneNumber === 'string' ? rawPhoneNumber : '';
  const { t } = useTranslation();
  const { authenticateWithPhone } = useAuth();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const submittingCode = useRef<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [deadline, setDeadline] = useState(
    () => Date.now() + RESEND_SECONDS * 1000,
  );
  const [now, setNow] = useState(() => Date.now());
  const secondsRemaining = getResendSecondsRemaining(deadline, now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    const focusTimer = setTimeout(() => inputRefs.current[0]?.focus(), 300);
    return () => {
      clearInterval(timer);
      clearTimeout(focusTimer);
      subscription.remove();
    };
  }, []);

  const verify = useCallback(
    async (candidate = code) => {
      if (
        candidate.length !== 6 ||
        isVerifying ||
        submittingCode.current === candidate
      ) {
        return;
      }

      submittingCode.current = candidate;
      setIsVerifying(true);
      setError('');

      try {
        const nextStep = await authenticateWithPhone({
          phoneNumber,
          code: candidate,
        });

        try {
          await registerDriverPushNotifications();
        } catch (pushError) {
          console.warn(
            'Driver push registration failed after phone verification.',
            pushError,
          );
        }

        const savedRoute = await readLastOnboardingRoute();
        const targetRoute = resolveDriverEntryRoute(nextStep, savedRoute);

        if (nextStep === 'HOME') {
          await clearLastOnboardingRoute();
        }

        router.dismissAll();
        router.replace(targetRoute as Href);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('Unable to verify the code.'),
        );
        setCode('');
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      } finally {
        setIsVerifying(false);
      }
    },
    [authenticateWithPhone, code, isVerifying, phoneNumber, router, t],
  );

  const resend = useCallback(async () => {
    if (secondsRemaining > 0 || isResending) return;
    setIsResending(true);
    setError('');
    try {
      await sendDriverPhoneVerificationCode({ phoneNumber });
      setDeadline(Date.now() + RESEND_SECONDS * 1000);
      setNow(Date.now());
      setCode('');
      inputRefs.current[0]?.focus();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Unable to resend the code.'),
      );
    } finally {
      setIsResending(false);
    }
  }, [isResending, phoneNumber, secondsRemaining, t]);

  const cells = useMemo(
    () => Array.from({ length: 6 }, (_, index) => code[index] || ''),
    [code],
  );

  const updateCode = useCallback(
    (index: number, value: string) => {
      const enteredDigits = normalizeOtpCode(value);
      const nextCode = enteredDigits
        ? `${code.slice(0, index)}${enteredDigits}${code.slice(
            index + enteredDigits.length,
          )}`.slice(0, 6)
        : `${code.slice(0, index)}${code.slice(index + 1)}`;

      setCode(nextCode);
      submittingCode.current = null;

      if (nextCode.length === 6) {
        setTimeout(() => void verify(nextCode), 0);
        return;
      }

      const nextIndex = Math.min(index + Math.max(enteredDigits.length, 1), 5);
      setTimeout(() => inputRefs.current[nextIndex]?.focus(), 0);
    },
    [code, verify],
  );

  if (!phoneNumber) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>{t('Change phone number')}</Text>
          </Pressable>

          <View style={styles.icon}>
            <Text style={styles.iconText}>✓</Text>
          </View>

          <Text style={styles.title}>{t('Enter verification code')}</Text>
          <Text style={styles.subtitle}>
            {t('Enter the six-digit code sent by SMS to {{phone}}', {
              phone: maskPhoneNumber(phoneNumber),
            })}
          </Text>

          <View style={styles.cells}>
            {cells.map((digit, index) => (
              <TextInput
                key={index}
                ref={(input) => {
                  inputRefs.current[index] = input;
                }}
                accessibilityLabel={`${t('Six digit verification code')} ${index + 1}`}
                value={digit}
                onChangeText={(value) => updateCode(index, value)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === 'Backspace' && !digit && index > 0) {
                    updateCode(index - 1, '');
                  }
                }}
                editable={!isVerifying}
                keyboardType="number-pad"
                textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={6 - index}
                selectTextOnFocus
                style={[
                  styles.cell,
                  code.length === index && styles.cellFocused,
                  error ? styles.cellError : undefined,
                ]}
              />
            ))}
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[
              styles.button,
              (code.length !== 6 || isVerifying) && styles.disabled,
            ]}
            disabled={code.length !== 6 || isVerifying}
            onPress={() => void verify()}
          >
            {isVerifying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t('Verify and continue')}</Text>
            )}
          </Pressable>

          <View style={styles.resendRow}>
            <Text style={styles.resendPrompt}>
              {t("Didn't receive the code?")}
            </Text>
            <Pressable
              disabled={secondsRemaining > 0 || isResending}
              onPress={() => void resend()}
            >
              <Text
                style={[
                  styles.resend,
                  secondsRemaining > 0 && styles.resendDisabled,
                ]}
              >
                {isResending
                  ? t('Sending…')
                  : secondsRemaining > 0
                    ? t('Resend in {{seconds}}s', {
                        seconds: secondsRemaining,
                      })
                    : t('Resend code')}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    justifyContent: 'center',
  },
  backText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 14,
  },
  icon: {
    marginTop: 48,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  iconText: {
    color: '#1D4ED8',
    fontSize: 26,
    fontWeight: '900',
  },
  title: {
    marginTop: 22,
    color: '#0F172A',
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 15,
    lineHeight: 23,
  },
  cells: {
    marginTop: 34,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 7,
  },
  cell: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 0.84,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D8DDE6',
    backgroundColor: '#F8FAFC',
    color: '#111827',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
  },
  cellFocused: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
  },
  cellError: {
    borderColor: '#D14343',
  },
  error: {
    color: '#C62828',
    fontSize: 14,
    marginTop: 14,
  },
  button: {
    minHeight: 54,
    marginTop: 26,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
  },
  disabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  resendRow: {
    marginTop: 22,
    alignItems: 'center',
    gap: 7,
  },
  resendPrompt: {
    color: '#64748B',
    fontSize: 14,
  },
  resend: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 14,
  },
  resendDisabled: {
    color: '#98A2B3',
  },
});
