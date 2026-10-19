import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDriverAccess } from '@/hooks/use-driver-access';

export function DriverRegistrationNotice() {
  const { canInteract, continueRegistration } = useDriverAccess();
  const { t } = useTranslation();
  if (canInteract) return null;
  return <View style={styles.notice}>
    <Text style={styles.text}>{t('You can browse the app. Complete registration and get admin approval to send offers or contact clients.')}</Text>
    <Pressable accessibilityRole="button" onPress={() => void continueRegistration()} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Text style={styles.buttonText}>{t('Continue registration')}</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  notice: { paddingHorizontal: 20, paddingVertical: 12, gap: 8, backgroundColor: '#FFF8DF' },
  text: { color: '#374151', fontSize: 14, lineHeight: 20 },
  button: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { color: '#111827', fontSize: 15, fontWeight: '700' },
});
