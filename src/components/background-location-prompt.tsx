import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { finishBackgroundLocationPrompt, getBackgroundLocationPrompt, subscribeBackgroundLocationPrompt } from '@/location/background-location-prompt';

export function BackgroundLocationPrompt() {
  const { t } = useTranslation();
  const visible = useSyncExternalStore(subscribeBackgroundLocationPrompt, getBackgroundLocationPrompt, getBackgroundLocationPrompt);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  useEffect(() => () => finishBackgroundLocationPrompt({ continue: false, dontShowAgain: false }), []);
  const finish = (proceed: boolean) => {
    setDontShowAgain(false);
    finishBackgroundLocationPrompt({ continue: proceed, dontShowAgain });
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish(false)}>
    <View style={styles.backdrop}>
      <View style={styles.dialog} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title} accessibilityRole="header">{t('Location during your trip')}</Text>
          <Text style={styles.body}>{t('Transpo24 shares your location with the customer during an active pickup or delivery, including when the app is minimized or the screen is locked. Enable background location in the next system screen.')}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={t("Don't show again")} accessibilityState={{ checked: dontShowAgain }}
            onPress={() => setDontShowAgain(value => !value)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, dontShowAgain && styles.checked]}>
              {dontShowAgain ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.label}>{t("Don't show again")}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => finish(false)} style={styles.button}>
              <Text style={styles.label}>{t('Not now')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => finish(true)} style={[styles.button, styles.continueButton]}>
              <Text style={styles.label}>{t('Continue')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: '#FFFFFF', borderRadius: 22 },
  content: { padding: 24, gap: 18 }, title: { fontSize: 21, fontWeight: '700', color: '#172033' },
  body: { fontSize: 16, lineHeight: 24, color: '#475467' }, checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: '#667085', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#FFC515', borderColor: '#E5AD00' }, checkmark: { color: '#172033', fontWeight: '800', fontSize: 18 },
  label: { color: '#172033', fontSize: 16, flexShrink: 1 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12 }, continueButton: { backgroundColor: '#FFC515' },
});
