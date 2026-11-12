import { useAuth } from '@/context/auth-context';
import { getBackendApiBaseUrl as apiBase } from '@/config/backend';
import { getCurrentAccessToken } from '@/lib/auth-storage';

import { useDriverColors } from '@/theme/driver-theme';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from 'react-i18next';

type Policy = { version: string; text: string; accepted: boolean };
type RenewSession = () => Promise<{ status: string }>;
async function legalRequest(token: string, renewSession: RenewSession, init: RequestInit): Promise<Response> {
  const endpoint = apiBase() + '/auth/legal';
  const send = (credential: string) => fetch(endpoint, {
    ...init,
    headers: { ...init.headers, Authorization: 'Bearer ' + credential },
  });
  const response = await send(token);
  if (response.status !== 401) return response;
  const renewed = await renewSession();
  const currentToken = getCurrentAccessToken();
  return renewed.status === 'restored' && currentToken ? send(currentToken) : response;
}
async function loadPolicy(token: string, renewSession: RenewSession): Promise<Policy> {
  const response = await legalRequest(token, renewSession, { method: 'GET' });
  if (!response.ok) throw new Error('Unable to load terms');
  const value = await response.json();
  if (typeof value.version !== 'string' || typeof value.text !== 'string' || typeof value.accepted !== 'boolean') {
    throw new Error('Invalid terms response');
  }
  return value as Policy;
}
export function LegalConsentBoundary({ children }: { children: React.ReactNode }) {
  const { accessToken: token, signOut: logout, continueWithTrustedSession, user } = useAuth();
  return token ? <AccountConsent key={user?.id} token={token} logout={logout} renewSession={continueWithTrustedSession}>{children}</AccountConsent> : <>{children}</>;
}
function AccountConsent({ token, logout, renewSession, children }: { token: string; logout: () => Promise<void>; renewSession: RenewSession; children: React.ReactNode }) {
  const { t } = useTranslation();
  const colors = useDriverColors();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void loadPolicy(token, renewSession)
      .then(value => { if (active) { setPolicy(value); setError(false); } })
      .catch(() => { if (active) setError(true); });
    void SplashScreen.hideAsync();
    return () => { active = false; };
  }, [token, renewSession, retry]);
  if (policy?.accepted) return <>{children}</>;
  async function accept() {
    if (!policy || !checked || busy) return;
    setBusy(true); setError(false);
    try {
      const response = await legalRequest(token, renewSession, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: policy.version }) });
      if (!response.ok) throw Error();
      setPolicy({ ...policy, accepted: true });
    } catch {
      try {
        const current = await loadPolicy(getCurrentAccessToken() ?? token, renewSession);
        setPolicy(current);
        if (current.version !== policy.version) setChecked(false);
        setError(!current.accepted);
      } catch { setError(true); }
    } finally { setBusy(false); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16, flexGrow: 1 }}>
      <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: '#202020' }}>{t('Terms of Service')}</Text>
      {!policy && !error ? <ActivityIndicator /> : null}
      {policy ? <Text selectable style={{ fontSize: 16, lineHeight: 24, color: '#202020' }}>{policy.text}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: '#A31D1D' }}>{t('Unable to load Terms of Service. Please try again.')}</Text> : null}
      {policy ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={t('Agree to Terms of Service')} onPress={() => setChecked(!checked)} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: '#202020' }}>{checked ? '☑ ' : '☐ '}{t('I agree to the Terms of Service')}</Text>
      </Pressable> : null}
      {policy ? <Pressable accessibilityRole="button" disabled={!checked || busy} onPress={() => void accept()} style={{ minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: colors.primary, opacity: !checked || busy ? 0.5 : 1 }}>
        {busy ? <ActivityIndicator /> : <Text style={{ color: '#202020', fontWeight: '700', fontSize: 16 }}>{t('Continue')}</Text>}
      </Pressable> : <Pressable accessibilityRole="button" onPress={() => { setError(false); setRetry(retry + 1); }} style={{ minHeight: 48, justifyContent: 'center' }}><Text>{t('Retry')}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => void logout()} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: '#202020' }}>{t('Logout')}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
