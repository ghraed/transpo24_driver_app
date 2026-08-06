import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoginIntroGate } from '@/components/login-intro-gate';
import { useAuth } from '@/context/auth-context';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { resetUsersForTesting, sendDriverPhoneVerificationCode } from '@/lib/api';
import { readTrustedDriverSession } from '@/lib/auth-storage';
import { buildInternationalPhoneNumber, normalizeDialingCode } from '@/lib/phone-number';
import { useAppLanguage } from '@/localization/provider';

const authTheme = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F7FB',
  border: '#E5E8EF',
  text: '#111827',
  textMuted: '#68768A',
  accent: '#FFC548',
  accentStrong: '#9A6500',
  accentSoft: '#FFF9E8',
  danger: '#C62828',
} as const;

type DriverPhoneAuthScreenProps = {
  mode: 'login' | 'register';
};

export function DriverPhoneAuthScreen({ mode }: DriverPhoneAuthScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const { continueWithTrustedSession } = useAuth();
  const keyboardInset = useAndroidKeyboardInset();
  const [dialingCode, setDialingCode] = useState('+961');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trustedPhoneNumber, setTrustedPhoneNumber] = useState('');
  const [isContinuing, setIsContinuing] = useState(false);
  const [isResettingUsers, setIsResettingUsers] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const canContinue = mode === 'login' && Boolean(trustedPhoneNumber) && !phoneNumber.trim();

  useEffect(() => {
    if (mode !== 'login') return;

    void readTrustedDriverSession().then((session) => {
      setTrustedPhoneNumber(session?.phoneNumber ?? '');
    });
  }, [mode]);

  const sendCode = useCallback(async (): Promise<void> => {
    if (isSubmitting) return;

    setHasAttemptedSubmit(true);
    if (!phoneNumber.trim()) {
      setErrorMessage(t('Phone number is required.'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    const normalizedPhoneNumber = buildInternationalPhoneNumber(dialingCode, phoneNumber);

    try {
      await sendDriverPhoneVerificationCode({ phoneNumber: normalizedPhoneNumber });
      const destination = { pathname: '/verify-phone' as const, params: { phoneNumber: normalizedPhoneNumber } };
      if (mode === 'login') {
        router.push(destination);
      } else {
        router.replace(destination);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Unable to send the verification code.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [dialingCode, isSubmitting, mode, phoneNumber, router, t]);

  const continueTrustedSession = useCallback(async (): Promise<void> => {
    if (!canContinue || isContinuing) return;

    setErrorMessage('');
    setIsContinuing(true);
    const restored = await continueWithTrustedSession();
    if (!restored) {
      setTrustedPhoneNumber('');
      setErrorMessage(t('Unable to continue. Please request a verification code.'));
    }
    setIsContinuing(false);
  }, [canContinue, continueWithTrustedSession, isContinuing, t]);

  const resetDriverUsers = useCallback(async (): Promise<void> => {
    if (isResettingUsers) return;

    setIsResettingUsers(true);
    setErrorMessage('');
    try {
      const response = await resetUsersForTesting();
      setErrorMessage(t('Deleted {{count}} driver user(s). Kept {{email}}. Non-driver roles were not targeted.', {
        count: response.deletedUsers,
        email: response.keptEmail,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Failed to reset users.'));
    } finally {
      setIsResettingUsers(false);
    }
  }, [isResettingUsers, t]);

  const goToAlternateScreen = useCallback(() => {
    if (mode === 'login') {
      router.push('/register');
    } else {
      router.replace('/');
    }
  }, [mode, router]);

  const showRequiredPhoneError = hasAttemptedSubmit && !phoneNumber.trim() && !errorMessage;

  return (
    <LoginIntroGate>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.container, keyboardInset > 0 && styles.containerKeyboardOpen, keyboardInset > 0 && { paddingBottom: keyboardInset + 20 }]}>
            <View style={[styles.brandHeader, keyboardInset > 0 && styles.brandHeaderCompact]}>
              <Text style={styles.brandName}>Transpo24</Text>
              <View style={styles.brandAccent} />
              <Text style={styles.brandRole}>{t('Driver')}</Text>
            </View>
            <View style={styles.card}>
              {mode === 'login' ? <Text style={[styles.title, isRTL && styles.rtl]}>{t('Continue as a driver')}</Text> : null}
              {mode === 'register' ? <Text style={[styles.progress, isRTL && styles.rtl]}>{t('Step 0 of 3: Verify Mobile')}</Text> : null}
              <Text style={[styles.label, isRTL && styles.rtl]}>{t('Phone number')}</Text>
              <View style={[styles.phoneField, isRTL && styles.phoneFieldRtl]}>
                <TextInput
                  accessibilityLabel={t('Country calling code')}
                  style={[styles.dialingCodeInput, isRTL && styles.rtlInput]}
                  value={dialingCode}
                  onChangeText={(value) => setDialingCode(normalizeDialingCode(value))}
                  placeholder="+961"
                  placeholderTextColor="#8A94A6"
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
                <View style={styles.phoneDivider} />
                <TextInput
                  accessibilityLabel={t('Phone number')}
                  style={[styles.phoneInput, isRTL && styles.rtlInput]}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder={t('Mobile number')}
                  placeholderTextColor="#8A94A6"
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  onSubmitEditing={() => void sendCode()}
                />
              </View>
              {showRequiredPhoneError ? <Text accessibilityRole="alert" style={[styles.error, isRTL && styles.rtl]}>{t('Phone number is required.')}</Text> : null}
              {errorMessage ? <Text accessibilityRole="alert" style={[styles.error, isRTL && styles.rtl]}>{errorMessage}</Text> : null}
              {canContinue ? (
                <Pressable style={[styles.secondaryButton, isContinuing && styles.disabled]} disabled={isContinuing} onPress={() => void continueTrustedSession()}>
                  {isContinuing ? <ActivityIndicator color={authTheme.accentStrong} /> : <Text style={styles.secondaryButtonText}>{t('Continue as {{phone}}', { phone: trustedPhoneNumber })}</Text>}
                </Pressable>
              ) : null}
              <Pressable style={[styles.button, isSubmitting && styles.disabled]} disabled={isSubmitting} onPress={() => void sendCode()}>
                {isSubmitting ? <ActivityIndicator color={authTheme.text} /> : <Text style={styles.buttonText}>{t('Send verification code')}</Text>}
              </Pressable>
              {mode === 'login' ? (
                <Pressable style={[styles.testingButton, isResettingUsers && styles.disabled]} disabled={isResettingUsers} onPress={() => void resetDriverUsers()}>
                  {isResettingUsers ? <ActivityIndicator color={authTheme.accentStrong} /> : <Text style={styles.testingButtonText}>{t('Delete Driver Users Except driver@test.com')}</Text>}
                </Pressable>
              ) : null}
              <View style={styles.footerRow}>
                {mode === 'login' ? <Text style={[styles.footerText, isRTL && styles.rtl]}>{t('New driver?')}</Text> : null}
                <Pressable onPress={goToAlternateScreen} accessibilityRole="button">
                  <Text style={[styles.footerLink, isRTL && styles.rtl]}>{mode === 'login' ? t('Create an account') : t('Already have an account? Sign in')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LoginIntroGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: authTheme.surface },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22, backgroundColor: authTheme.surface },
  containerKeyboardOpen: { paddingTop: 0 },
  brandHeader: { height: 224, alignItems: 'center', justifyContent: 'center' },
  brandHeaderCompact: { height: 108 },
  brandName: { color: authTheme.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.6 },
  brandAccent: { width: 74, height: 7, marginTop: 4, borderRadius: 999, backgroundColor: authTheme.accent },
  brandRole: { marginTop: 8, color: authTheme.textMuted, fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  card: { borderRadius: 28, padding: 24, backgroundColor: authTheme.surface, borderWidth: 1, borderColor: authTheme.border, elevation: 7, shadowColor: authTheme.text, shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  title: { fontSize: 18, lineHeight: 34, fontWeight: '800', color: authTheme.text, marginBottom: 22 },
  progress: { fontSize: 13, fontWeight: '800', color: authTheme.accentStrong, marginBottom: 22 },
  label: { marginBottom: 8, fontSize: 13, color: authTheme.text, fontWeight: '700' },
  phoneField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: authTheme.border, borderRadius: 16, overflow: 'hidden', backgroundColor: authTheme.surfaceMuted },
  phoneFieldRtl: { flexDirection: 'row-reverse' },
  dialingCodeInput: { width: 88, minHeight: 56, paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: authTheme.text, textAlign: 'center' },
  phoneDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: authTheme.border },
  phoneInput: { flex: 1, minHeight: 56, paddingHorizontal: 14, fontSize: 17, color: authTheme.text, textAlign: 'left' },
  rtlInput: { textAlign: 'right', writingDirection: 'rtl' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  error: { color: authTheme.danger, fontSize: 14, marginTop: 10 },
  button: { minHeight: 54, borderRadius: 16, backgroundColor: authTheme.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  secondaryButton: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: '#D1A52A', backgroundColor: authTheme.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  testingButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: authTheme.border, backgroundColor: authTheme.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  disabled: { opacity: 0.65 },
  buttonText: { fontSize: 16, fontWeight: '800', color: authTheme.text },
  secondaryButtonText: { fontSize: 15, fontWeight: '800', color: authTheme.accentStrong },
  testingButtonText: { fontSize: 13, fontWeight: '700', color: authTheme.textMuted },
  footerRow: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerText: { fontSize: 14, color: authTheme.textMuted },
  footerLink: { fontSize: 14, fontWeight: '800', color: authTheme.accentStrong },
});
