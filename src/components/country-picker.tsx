import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/localization/provider';

const COUNTRY_CODES = [
  'AD', 'AL', 'AM', 'AT', 'AX', 'AZ', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK',
  'EE', 'ES', 'FI', 'FO', 'FR', 'GB', 'GE', 'GG', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS',
  'IT', 'JE', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT',
  'RO', 'RS', 'SE', 'SI', 'SJ', 'SK', 'SM', 'TR', 'UA', 'VA', 'XK',
  'AE', 'LB', 'QA', 'SA', 'US',
  'RU',
] as const;

type CountryCode = (typeof COUNTRY_CODES)[number];

type CountryOption = {
  code: CountryCode;
  name: string;
};

type Props = {
  value: string;
  onChange: (countryCode: string) => void;
};

const COUNTRY_LABELS: Record<CountryCode, string> = {
  AD: 'Andorra',
  AL: 'Albania',
  AM: 'Armenia',
  AT: 'Austria',
  AX: 'Aland Islands',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BE: 'Belgium',
  BG: 'Bulgaria',
  BY: 'Belarus',
  CH: 'Switzerland',
  CY: 'Cyprus',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  ES: 'Spain',
  FI: 'Finland',
  FO: 'Faroe Islands',
  FR: 'France',
  GB: 'United Kingdom',
  GE: 'Georgia',
  GG: 'Guernsey',
  GI: 'Gibraltar',
  GR: 'Greece',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IM: 'Isle of Man',
  IS: 'Iceland',
  IT: 'Italy',
  JE: 'Jersey',
  LI: 'Liechtenstein',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MK: 'North Macedonia',
  MT: 'Malta',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  SE: 'Sweden',
  SI: 'Slovenia',
  SJ: 'Svalbard and Jan Mayen',
  SK: 'Slovakia',
  SM: 'San Marino',
  TR: 'Turkey',
  UA: 'Ukraine',
  VA: 'Vatican City',
  XK: 'Kosovo',
  AE: 'United Arab Emirates',
  LB: 'Lebanon',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  US: 'United States',
};

function countryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (character) =>
      String.fromCodePoint(127397 + character.charCodeAt(0)),
    );
}

function countryName(countryCode: CountryCode, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) ||
      COUNTRY_LABELS[countryCode]
    );
  } catch {
    return COUNTRY_LABELS[countryCode];
  }
}

export function CountryPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { locale } = useAppLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const countries = useMemo<CountryOption[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return COUNTRY_CODES
      .map((code) => ({ code, name: countryName(code, locale) }))
      .sort((left, right) => left.name.localeCompare(right.name, locale))
      .filter(
      (item) =>
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.code.toLowerCase().includes(normalizedSearch),
    );
  }, [locale, search]);

  const selectedLabel = useMemo(() => {
    const normalized = value.trim().toUpperCase();
    const selected = COUNTRY_CODES.find((code) => code === normalized);
    return selected ? countryName(selected, locale) : '';
  }, [locale, value]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Select country')}
        style={styles.trigger}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.flag}>{value ? countryFlag(value) : '🌍'}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {selectedLabel || t('Select country')}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('Select country')}</Text>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
              <Text style={styles.done}>{t('Done')}</Text>
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('Search countries')}
            autoCapitalize="none"
            style={styles.search}
          />

          <FlatList
            data={countries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={24}
            windowSize={8}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onChange(item.code);
                  setSearch('');
                  setOpen(false);
                }}
              >
                <Text style={styles.flag}>{countryFlag(item.code)}</Text>
                <Text style={styles.countryName}>{item.name}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  flag: { fontSize: 22 },
  value: { flex: 1, color: '#202020', fontSize: 15, fontWeight: '600' },
  chevron: { color: '#68768A', fontSize: 16 },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EBF0',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  done: { color: '#A56B00', fontSize: 16, fontWeight: '800' },
  search: {
    margin: 16,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F3F5F8',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8EBF0',
  },
  countryName: { flex: 1, fontSize: 16, color: '#111827' },
});
