import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DriverIcon } from '@/components/ui/driver-ui';
import { getCallingCode } from '@/lib/phone-number';
import { useAppLanguage } from '@/localization/provider';
import { driverRadius, driverSpace, driverType, driverThemes } from '@/theme/driver-theme';

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
  callingCode: string;
  searchText: string;
};

type Props = {
  value: string;
  onChange: (countryCode: string) => void;
  displayMode?: 'countryName' | 'callingCode';
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

export function CountryPicker({ value, onChange, displayMode = 'countryName' }: Props) {
  const { t } = useTranslation();
  const { locale, isRTL } = useAppLanguage();
  const isCallingCode = displayMode === 'callingCode';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const close = () => {
    setOpen(false);
    setSearch('');
  };

  // Localize, normalize, and sort once per language, outside the typing path.
  const countryOptions = useMemo<CountryOption[]>(() => COUNTRY_CODES
    .map((code) => {
      const name = countryName(code, locale);
      return {
        code,
        name,
        callingCode: getCallingCode(code),
        searchText: `${name}\n${code}\n${COUNTRY_LABELS[code]}`.toLowerCase(),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, locale)), [locale]);

  const countries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return countryOptions;
    return countryOptions.filter((item) =>
      item.searchText.includes(query) || (isCallingCode && item.callingCode.includes(query)),
    );
  }, [countryOptions, isCallingCode, search]);

  const selectedLabel = useMemo(() =>
    countryOptions.find((item) => item.code === value.trim().toUpperCase())?.name ?? '',
  [countryOptions, value]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t(isCallingCode ? 'Country calling code' : 'Select country')}: ${selectedLabel} ${isCallingCode ? getCallingCode(value) : ''}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.trigger, isCallingCode && styles.callingCodeTrigger, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.flag}>{value ? countryFlag(value) : ''}</Text>
        <Text style={[styles.value, isCallingCode && styles.callingCodeValue]} numberOfLines={1}>
          {isCallingCode ? getCallingCode(value) : selectedLabel || t('Select country')}
        </Text>
        <DriverIcon name="chevron.down" size={16} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, isRTL && styles.rtlRow]}>
            <Text style={styles.modalTitle}>{t('Select country')}</Text>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.close, pressed && styles.pressed]} onPress={close}>
              <Text style={styles.done}>{t('Done')}</Text>
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('Search countries')}
            accessibilityLabel={t('Search countries')}
            autoCorrect={false}
            autoCapitalize="none"
            style={[styles.search, isRTL && styles.rtlText]}
          />

          <FlatList
            data={countries}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            initialNumToRender={24}
            maxToRenderPerBatch={24}
            updateCellsBatchingPeriod={0}
            windowSize={8}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === value }}
                style={({ pressed }) => [styles.row, isRTL && styles.rtlRow, pressed && styles.pressed]}
                onPress={() => {
                  onChange(item.code);
                  close();
                }}
              >
                <Text style={styles.flag}>{countryFlag(item.code)}</Text>
                <Text style={[styles.countryName, isRTL && styles.rtlText]}>{item.name}</Text>
                {isCallingCode ? <Text style={styles.rowCode}>{item.callingCode}</Text> : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const colors = driverThemes.light;
const styles = StyleSheet.create({
  callingCodeTrigger: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: driverSpace.md, gap: driverSpace.sm },
  callingCodeValue: { flex: 0, writingDirection: 'ltr' },
  rowCode: { ...driverType.label, color: colors.textSecondary, writingDirection: 'ltr' },
  close: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  trigger: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  flag: { fontSize: 22 },
  value: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: colors.surface },
  modalHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  done: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  search: {
    margin: 16,
    minHeight: 50,
    borderRadius: driverRadius.md,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  countryName: { flex: 1, fontSize: 16, color: colors.text },
});
