import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export function PrivacyControls() {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  async function open(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch {
      setError(t('Open device settings manually, or email privacy@transpo24.ch for privacy requests.'));
    }
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{t('Your privacy controls')}</Text>
      <Text style={styles.copy}>{t('No advertising or optional audience analytics are integrated in this app. Accepting the terms does not give consent to optional tracking.')}</Text>
      <Text style={styles.copy}>{t('Manage location, camera, photos and notifications in device settings. Changing a permission affects only the related feature; it does not cancel a booking.')}</Text>
      {Platform.OS !== 'web' ? (
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void open(() => Linking.openSettings())}>
          <Text style={styles.label}>{t('Manage device permissions')}</Text>
        </Pressable>
      ) : (
        <Text style={styles.copy}>{t('Use your browser site settings to manage permissions.')}</Text>
      )}
      <Pressable accessibilityRole="link" style={styles.button} onPress={() => void open(() => Linking.openURL('mailto:privacy@transpo24.ch?subject=Transpo24%20privacy%20request'))}>
        <Text style={styles.label}>{t('Request access, correction or deletion')}</Text>
      </Pressable>
      <Text selectable style={styles.copy}>privacy@transpo24.ch</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: '#DFE3E8', backgroundColor: '#FFFFFF' },
  title: { fontSize: 20, fontWeight: '700', color: '#171717' },
  copy: { fontSize: 15, lineHeight: 23, color: '#374151' },
  button: { minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 12, backgroundColor: '#F3F4F6' },
  label: { fontSize: 15, fontWeight: '600', color: '#171717' },
  error: { fontSize: 14, lineHeight: 21, color: '#B91C1C' },
});
