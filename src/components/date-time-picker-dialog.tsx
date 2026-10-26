import NativeDateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DriverButton } from '@/components/ui/driver-ui';
import { driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';

type Props = {
  value: Date;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
  is24Hour?: boolean;
  locale?: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

function initialValue({ value, mode, minimumDate, maximumDate }: Props): Date {
  const date = Number.isFinite(value.getTime()) ? value : new Date();
  if (mode === 'time') return date;
  const day = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  if (minimumDate && day(date) < day(minimumDate)) return minimumDate;
  if (maximumDate && day(date) > day(maximumDate)) return maximumDate;
  return date;
}

// Mount a fresh dialog for each edit. iOS wheel changes stay in a draft until Save.
export function DateTimePickerDialog(props: Props) {
  const { mode, minimumDate, maximumDate, is24Hour, locale, onConfirm, onCancel } = props;
  const { t } = useTranslation();
  const colors = useDriverColors();
  const [pending, setPending] = useState(() => initialValue(props));
  const callbacks = useRef({ onConfirm, onCancel });
  useLayoutEffect(() => { callbacks.current = { onConfirm, onCancel }; }, [onConfirm, onCancel]);
  // Android reopens/updates its native dialog when the callback identity changes.
  const handleChange = useCallback((event: DateTimePickerEvent, date?: Date) => {
    if (event.type !== 'set') { callbacks.current.onCancel(); return; }
    if (!date || !Number.isFinite(date.getTime())) return;
    if (Platform.OS === 'android') callbacks.current.onConfirm(date);
    else setPending(date);
  }, []);
  const picker = <NativeDateTimePicker
    value={pending}
    mode={mode}
    display="spinner"
    minimumDate={minimumDate}
    maximumDate={maximumDate}
    is24Hour={is24Hour}
    locale={locale}
    themeVariant="light"
    textColor={colors.text}
    positiveButton={{ label: t('Save') }}
    negativeButton={{ label: t('Cancel') }}
    onChange={handleChange}
  />;
  if (Platform.OS !== 'ios') return picker;
  return <Modal transparent visible onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <ScrollView style={styles.scroll}>{picker}</ScrollView>
        <View style={styles.actions}>
          <DriverButton label={t('Cancel')} variant="secondary" style={styles.action} onPress={onCancel} />
          <DriverButton label={t('Save')} style={styles.action} onPress={() => onConfirm(pending)} />
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: driverSpace.xl, backgroundColor: '#0006' },
  sheet: { maxHeight: '90%', borderRadius: driverRadius.lg, padding: driverSpace.xl },
  scroll: { flexGrow: 0, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: driverSpace.md },
  action: { flex: 1 },
});
