import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
export type RequestType = 'immediate' | 'scheduled';
export function RequestTypeTabs({ value, onChange }: { value: RequestType; onChange: (value: RequestType) => void }) {
  const { t } = useTranslation();
  return <View style={styles.row} accessibilityRole="tablist">
    {(['immediate', 'scheduled'] as const).map(type => <Pressable key={type} accessibilityRole="tab" accessibilityState={{ selected: value === type }}
      onPress={() => onChange(type)} style={[styles.tab, value === type && styles.selected]}>
      <Text style={styles.text}>{t(type === 'immediate' ? 'Immediate' : 'Scheduled')}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8, marginVertical: 10 }, tab: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 14, backgroundColor: '#FFFFFF' }, selected: { backgroundColor: '#FFC515' }, text: { color: '#172033', fontWeight: '700' } });
