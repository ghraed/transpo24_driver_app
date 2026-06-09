import { Link, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { getDriverRouteForNextStep } from '@/lib/driver-onboarding';
import {
  clearRememberedCredentials,
  persistRememberedCredentials,
  readRememberedCredentials,
} from '@/lib/auth-storage';

export default function DriverLoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const loadRemembered = async (): Promise<void> => {
      const remembered = await readRememberedCredentials();
      if (!remembered) return;
      setEmail(remembered.email);
      setPassword(remembered.password);
      setRememberMe(true);
    };

    void loadRemembered();
  }, []);

  const onLogin = useCallback(async (): Promise<void> => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Email and password are required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const nextStep = await signIn({
        email: email.trim().toLowerCase(),
        password,
      });

      if (rememberMe) {
        await persistRememberedCredentials(email.trim().toLowerCase(), password);
      } else {
        await clearRememberedCredentials();
      }

      router.replace(getDriverRouteForNextStep(nextStep));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, rememberMe, router, signIn]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Driver Login</Text>
        <Text style={styles.subtitle}>Sign in to manage your transport requests.</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.rememberRow} onPress={() => setRememberMe((prev) => !prev)}>
        <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
          {rememberMe ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={styles.rememberText}>Remember me</Text>
      </Pressable>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={() => void onLogin()} disabled={isSubmitting}>
        {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Login</Text>}
      </Pressable>

      <Link href="/register" style={styles.linkText}>
        New driver? Create an account
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
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
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
    fontSize: 16,
  },
  linkText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#1D4ED8',
    fontWeight: '600',
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 6,
  },
});
