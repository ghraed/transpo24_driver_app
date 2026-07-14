import { Link, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  clearLastOnboardingRoute,
  clearRememberedCredentials,
  readLastOnboardingRoute,
  persistRememberedCredentials,
  readRememberedCredentials,
} from '@/lib/auth-storage';
import { resetUsersForTesting } from '@/lib/api';
import { resolveDriverEntryRoute } from '@/lib/onboarding-route';
import { registerDriverPushNotifications } from '@/notifications/registerPushNotifications';

export default function DriverLoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResettingUsers, setIsResettingUsers] = useState(false);

  useEffect(() => {
    const loadRemembered = async (): Promise<void> => {
      const remembered = await readRememberedCredentials();
      if (!remembered) return;
      setEmail(remembered.email);
      setPassword(remembered.password);
      setRememberMe(true);
    };

    const timeoutId = setTimeout(() => {
      void loadRemembered();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []);

  const onLogin = useCallback(async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.replace(/[\r\n]+/g, '');

    if (!normalizedEmail || !normalizedPassword) {
      setErrorMessage(t('Email and password are required.'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const nextStep = await signIn({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      try {
        await registerDriverPushNotifications();
      } catch (pushError) {
        console.warn('Driver push registration failed after login.', pushError);
      }

      const savedRoute = await readLastOnboardingRoute();
      const targetRoute = resolveDriverEntryRoute(nextStep, savedRoute);

      if (rememberMe) {
        await persistRememberedCredentials(normalizedEmail, normalizedPassword);
      } else {
        await clearRememberedCredentials();
      }

      if (nextStep === 'HOME') {
        await clearLastOnboardingRoute();
      }

      router.replace(targetRoute as Href);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('Login failed.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, rememberMe, router, signIn, t]);

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('Driver Login')}</Text>
        <Text style={styles.subtitle}>{t('Sign in to manage your transport requests.')}</Text>
        <Text style={styles.helperText}>
          {t('Test account: `driver@test.com` with password `driver@test.com`.')}
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder={t('Email')}
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        importantForAutofill="yes"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, styles.passwordInput]}
        placeholder={t('Password')}
        autoComplete="current-password"
        textContentType="password"
        importantForAutofill="yes"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.rememberRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
          {rememberMe ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={styles.rememberText}>{t('Remember me')}</Text>
      </Pressable>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={() => void onLogin()}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('Login')}</Text>}
      </Pressable>

      <Pressable
        style={[styles.secondaryButton, isResettingUsers && styles.buttonDisabled]}
        onPress={() => void onResetUsers()}
        disabled={isResettingUsers}
      >
        {isResettingUsers ? (
          <ActivityIndicator color="#1D4ED8" />
        ) : (
          <Text style={styles.secondaryButtonText}>{t('Delete Driver Users Except driver@test.com')}</Text>
        )}
      </Pressable>

      <Link href="/register" style={styles.linkText}>
        {t('New driver? Create an account')}
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 24,
    justifyContent: 'center',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    borderColor: '#1D4ED8',
    backgroundColor: '#DBEAFE',
  },
  checkboxTick: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
  },
  rememberText: {
    color: '#334155',
    fontSize: 14,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    marginTop: 6,
    color: '#475467',
  },
  helperText: {
    marginTop: 8,
    color: '#475467',
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  passwordInput: {
    color: '#000000',
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  linkText: {
    marginTop: 16,
    color: '#2563EB',
    textAlign: 'center',
    fontWeight: '600',
  },
  errorText: {
    marginTop: 4,
    color: '#B91C1C',
    fontSize: 13,
  },
});
