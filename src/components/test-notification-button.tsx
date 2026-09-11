import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sendTestNotification } from '@/lib/api';
import { registerDriverPushNotifications } from '@/notifications/registerPushNotifications';

export function TestNotificationButton() {
  const { t } = useTranslation();
  const busy = useRef(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState('');

  const testNotification = async () => {
    if (busy.current) return;
    busy.current = true;
    setIsSending(true);
    setStatus('');
    try {
      const token = await registerDriverPushNotifications();
      if (!token) {
        setStatus(t('Enable notification permission in your phone settings, then try again.'));
        return;
      }
      await sendTestNotification(token);
      setStatus(t('Test sent. Check for a notification on this device. Delivery may take a moment.'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('Failed to send test notification.'));
    } finally {
      busy.current = false;
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSending, busy: isSending }}
        disabled={isSending}
        onPress={() => { void testNotification(); }}
        style={[styles.button, isSending && styles.disabled]}
      >
        <Text style={styles.label}>{t(isSending ? 'Sending test...' : 'Test Notification')}</Text>
      </Pressable>
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  button: { padding: 16, borderRadius: 12, backgroundColor: '#FFC515' },
  disabled: { opacity: 0.6 },
  label: { color: '#111827', fontWeight: '600', textAlign: 'center', fontSize: 16 },
  status: { marginTop: 8, color: '#374151', fontSize: 14 },
});
