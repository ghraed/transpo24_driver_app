import { Link, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/context/auth-context';
import type { DriverNextStep } from '@/types/auth';

function nextStepToRoute(nextStep: DriverNextStep): '/complete-profile' | '/vehicle-documents' | '/set-availability' | '/waiting-approval' | '/driver-home' {
  switch (nextStep) {
    case 'COMPLETE_PROFILE':
      return '/complete-profile';
    case 'ADD_VEHICLE_DOCUMENTS':
      return '/vehicle-documents';
    case 'SET_AVAILABILITY':
      return '/set-availability';
    case 'WAITING_APPROVAL':
      return '/waiting-approval';
    case 'HOME':
      return '/driver-home';
  }
}

export default function DriverLoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      router.replace(nextStepToRoute(nextStep));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, router, signIn]);

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
