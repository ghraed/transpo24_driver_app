import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { getLocaleForLanguage, resolveSupportedLanguage } from '@/localization/languages';

export function OfferDateTimeField({ label, value, onChange, error, disabled = false, minimumDate }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  minimumDate?: Date;
}) {
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir?.() === 'rtl';
  const rowDirection = rtl && styles.rtlRow;
  const textDirection = rtl && styles.rtlText;
  const locale = getLocaleForLanguage(resolveSupportedLanguage(i18n.language));
  const [mode, setMode] = useState<'date' | 'time'>();
  const [pending, setPending] = useState(new Date());
  const selected = value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
  const save = (date: Date) => { onChange(date.toISOString()); setMode(undefined); };
  const picker = mode ? <DateTimePicker
    value={pending}
    mode={mode}
    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
    is24Hour
    themeVariant="light"
    minimumDate={mode === 'date' ? minimumDate : undefined}
    onChange={(event, date) => {
      if (Platform.OS === 'android' && event.type !== 'set') { setMode(undefined); return; }
      if (!date) return;
      const next = new Date(pending);
      if (mode === 'date') next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      else next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      if (Platform.OS === 'android') save(next);
      else setPending(next);
    }}
  /> : null;
  return (
    <View style={styles.field}>
      <View style={[styles.labelRow, rowDirection]}>
        <Text style={[styles.label, textDirection]}>{label}</Text>
        {selected ? <Pressable disabled={disabled} accessibilityRole="button" accessibilityLabel={`${t('Clear')} — ${label}`} onPress={() => onChange('')} style={styles.clear}><Text style={styles.clearText}>{t('Clear')}</Text></Pressable> : null}
      </View>
      <View style={[styles.controls, rowDirection]}>
        {(['date', 'time'] as const).map((part) => <Pressable
          key={part}
          accessibilityRole="button"
          accessibilityLabel={`${label} — ${t(part === 'date' ? 'Date' : 'Time')}`}
          disabled={disabled}
          onPress={() => { setPending(selected ?? new Date(Math.max(Date.now() + 3600000, minimumDate?.getTime() ?? 0))); setMode(part); }}
          style={({ pressed }) => [styles.control, error && styles.invalid, pressed && styles.pressed, rowDirection]}
        >
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SymbolView name={part === 'date' ? { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' } : { ios: 'clock', android: 'schedule', web: 'schedule' }} tintColor="#5B6778" size={17} />
          </View>
          <Text style={[styles.controlText, !selected && styles.placeholder, textDirection]}>
            {selected ? part === 'date'
              ? selected.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
              : selected.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
              : t(part === 'date' ? 'Select date' : 'Select time')}
          </Text>
        </Pressable>)}
      </View>
      {error ? <Text accessibilityRole="alert" style={[styles.error, textDirection]}>{error}</Text> : null}
      {Platform.OS === 'ios' ? <Modal transparent visible={Boolean(mode)} animationType="fade" onRequestClose={() => setMode(undefined)}>
        <View style={styles.overlay}><View style={styles.sheet}>
          <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, textDirection]}>{label}</Text>
          {picker}
          </ScrollView>
          <View style={[styles.actions, rowDirection]}>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setMode(undefined)}><Text style={styles.label}>{t('Cancel')}</Text></Pressable>
            <Pressable accessibilityRole="button" style={[styles.action, styles.save]} onPress={() => save(pending)}><Text style={styles.label}>{t('Save')}</Text></Pressable>
          </View>
        </View></View>
      </Modal> : picker}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexShrink: 1, color: '#17212F', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  control: { flex: 1, minWidth: 108, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#DAE1E9', borderRadius: 12, minHeight: 50, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FAFBFC' },
  controlText: { flex: 1, color: '#17212F', fontSize: 13, lineHeight: 19 },
  placeholder: { color: '#5B6778' },
  clear: { marginStart: 'auto', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { color: '#5B6778', fontSize: 13, fontWeight: '600' },
  invalid: { borderColor: '#B91C1C' },
  pressed: { opacity: 0.7 },
  error: { color: '#B91C1C', fontSize: 13, lineHeight: 18 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { maxHeight: '90%', borderRadius: 22, padding: 20, backgroundColor: '#FFFFFF' },
  pickerScroll: { flexGrow: 0, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  action: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F5F8' },
  save: { backgroundColor: '#FFC548' },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
