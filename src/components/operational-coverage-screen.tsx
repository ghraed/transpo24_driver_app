import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth-context';
import { getOperationalCoverage, requestOperationalCountry, requestRoutePermission, type OperationalCoverage } from '@/lib/api';

const statusLabels = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', SUSPENDED: 'Suspended' };
export function OperationalCoverageScreen({ mode }: { mode: 'countries' | 'routes' }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [data, setData] = useState<OperationalCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pickup, setPickup] = useState(true);
  const [dropoff, setDropoff] = useState(true);
  const generation = useRef(0);
  const submitting = useRef(false);
  const mutation = useRef(0);
  const routes = mode === 'routes';
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setData(null);
    setError('');
    if (!accessToken) { setLoading(false); return; }
    try {
      const result = await getOperationalCoverage();
      if (version === generation.current) setData(result);
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : t('Unable to load coverage.'));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [accessToken, t]);
  useFocusEffect(useCallback(() => {
    setNotice(''); setFrom(''); setTo(''); setSaving(false); submitting.current = false;
    void load();
    return () => { generation.current += 1; mutation.current += 1; };
  }, [load]));
  const valid = /^[A-Z]{2}$/.test(from.trim().toUpperCase()) && (routes ? /^[A-Z]{2}$/.test(to.trim().toUpperCase()) : pickup || dropoff);
  const submit = async () => {
    if (!valid || !data || submitting.current || !accessToken) return;
    const operation = ++mutation.current;
    submitting.current = true;
    setSaving(true); setError(''); setNotice('');
    const version = generation.current;
    try {
      const result = routes
        ? await requestRoutePermission(from.trim().toUpperCase(), to.trim().toUpperCase())
        : await requestOperationalCountry(from.trim().toUpperCase(), pickup, dropoff);
      if (version !== generation.current) return;
      setNotice(`${t('Request status')}: ${t(statusLabels[result.status])}. ${t('Existing requests retain the administrator’s decision.')}`);
      await load();
    } catch (e) {
      if (version === generation.current) setError(e instanceof Error ? e.message : t('Unable to submit request.'));
    } finally {
      if (operation === mutation.current) {
        submitting.current = false;
        setSaving(false);
      }
    }
  };
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.link}>{t('Go back')}</Text></Pressable>
      <Text style={styles.title}>{t(routes ? 'Route permissions' : 'Operational countries')}</Text>
      <Text>{t('Operational approval does not change your home market. Only approved coverage and routes can qualify for jobs.')}</Text>
      {routes && <Text>{t('Route permissions are directional. The reverse direction requires a separate request. Same-country routes also require approval.')}</Text>}
      {loading && <ActivityIndicator accessibilityLabel={t('Loading')} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
      <Pressable accessibilityRole="button" disabled={loading || saving} onPress={() => void load()}><Text style={styles.link}>{t('Refresh / Retry')}</Text></Pressable>
      {data && <>
        {routes ? data.routes.map(row => <View key={row.id} style={styles.card}>
          <Text style={styles.heading}>{row.fromCountryCode} → {row.toCountryCode}</Text>
          <Text>{t(statusLabels[row.status])}</Text>
        </View>) : data.countries.map(row => <View key={row.id} style={styles.card}>
          <Text style={styles.heading}>{row.countryCode} · {t(statusLabels[row.status])}</Text>
          <Text>{t('Pickup')}: {t(row.canPickup ? 'Yes' : 'No')} · {t('Dropoff')}: {t(row.canDropoff ? 'Yes' : 'No')}</Text>
        </View>)}
        {data[mode].length === 0 && <Text>{t('No requests yet.')}</Text>}
        <Text style={styles.heading}>{t('Request approval')}</Text>
        <Text>{t('Enter two-letter country codes, for example FR, CH or LB.')}</Text>
        <Text>{t(routes ? 'From country' : 'Country')}</Text>
        <TextInput accessibilityLabel={t(routes ? 'From country' : 'Country')} value={from} onChangeText={setFrom} autoCapitalize="characters" autoCorrect={false} maxLength={2} editable={!saving} style={styles.input} />
        {routes ? <>
          <Text>{t('To country')}</Text>
          <TextInput accessibilityLabel={t('To country')} value={to} onChangeText={setTo} autoCapitalize="characters" autoCorrect={false} maxLength={2} editable={!saving} style={styles.input} />
        </> : <>
          <View style={styles.row}><Text>{t('Pickup')}</Text><Switch accessibilityLabel={t('Pickup')} value={pickup} onValueChange={setPickup} disabled={saving} /></View>
          <View style={styles.row}><Text>{t('Dropoff')}</Text><Switch accessibilityLabel={t('Dropoff')} value={dropoff} onValueChange={setDropoff} disabled={saving} /></View>
        </>}
        <Pressable accessibilityRole="button" accessibilityLabel={t('Request approval')} disabled={!valid || saving} onPress={() => void submit()} style={[styles.button, (!valid || saving) && styles.disabled]}>
          <Text style={styles.buttonText}>{t(saving ? 'Submitting…' : 'Request approval')}</Text>
        </Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' }, content: { padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700' }, heading: { fontSize: 18, fontWeight: '600' },
  link: { color: '#086c55', paddingVertical: 8 }, error: { color: '#b42318' },
  card: { padding: 16, gap: 8, borderRadius: 12, backgroundColor: '#f1f5f4' },
  input: { borderWidth: 1, borderColor: '#8b9692', borderRadius: 8, padding: 12, color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  button: { padding: 16, borderRadius: 10, backgroundColor: '#086c55' },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' }, disabled: { opacity: 0.45 },
});
