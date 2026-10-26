import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform, Text, TextInput } from 'react-native';
import CompleteProfileScreen from '@/app/complete-profile';

const mockT = key => key;
const mockDriver = {
  firstName: 'Alex', lastName: 'Smith', phone: '+96170123456', countryCode: 'LB', city: 'Beirut',
  fullNameOnId: 'Alex Smith', idOrResidencyNumberMasked: '****1234', dateOfBirth: '1990-01-01',
  driverType: 'PERSONAL', trn: null,
};
const mockRefresh = jest.fn(async () => ({ driver: mockDriver }));
const mockSave = jest.fn(async () => ({ nextStep: 'UPLOAD_DOCUMENTS' }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: mockDriver, refreshDriverMe: mockRefresh, saveDriverProfile: mockSave, signOut: jest.fn() }) }));
jest.mock('@/components/country-picker', () => ({ CountryPicker: () => null }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/auth-storage', () => ({ clearLastOnboardingRoute: jest.fn(), persistLastOnboardingRoute: jest.fn() }));
jest.mock('@/localization/response-message', () => ({ getSourceErrorMessage: (error, fallback) => error?.message || fallback }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

let tree;
const button = label => {
  let node = tree.root.findAllByType(Text).find(node => node.props.children === label);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  return node;
};
const trnInput = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Tax Registration Number (TRN)');
const originalOS = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 7, 20, 12));
  mockDriver.dateOfBirth = '1990-01-01';
  mockSave.mockClear();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  jest.useRealTimers();
});
async function render() {
  await act(async () => { tree = create(<CompleteProfileScreen />); });
  await act(async () => { jest.runOnlyPendingTimers(); });
}
test('requires a company TRN and submits the trimmed value without a nickname', async () => {
  await render();
  expect(trnInput()).toBeUndefined();
  await act(async () => button('Company').props.onPress());
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  expect(mockSave).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'TRN is required for companies.')).toBe(true);
  await act(async () => trnInput().props.onChangeText('  TRN-123  '));
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ driverType: 'COMPANY', trn: 'TRN-123' }));
  expect(mockSave.mock.calls[0][0]).not.toHaveProperty('nickname');
});
test('switching to personal hides and excludes a previously entered TRN', async () => {
  await render();
  await act(async () => button('Company').props.onPress());
  await act(async () => trnInput().props.onChangeText('TRN-123'));
  await act(async () => button('Personal').props.onPress());
  expect(trnInput()).toBeUndefined();
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ driverType: 'PERSONAL', trn: '' }));
});

test.each(['android', 'ios'])('%s birth date can move earlier and later and submits the selected value', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  mockDriver.dateOfBirth = '';
  await render();
  await act(async () => button('Select date of birth').props.onPress());
  let picker = tree.root.findByType('DateTimePicker');
  expect(picker.props.value.getFullYear()).toBe(2008);
  expect(picker.props.minimumDate).toEqual(new Date(1900, 0, 1));
  expect(picker.props.maximumDate.getFullYear()).toBe(2008);

  const earlier = new Date(1965, 1, 12);
  await act(async () => picker.props.onChange({ type: 'set' }, earlier));
  if (os === 'ios') {
    // Editing a wheel must leave the dialog open until confirmation.
    expect(tree.root.findByType('DateTimePicker').props.value).toEqual(earlier);
    await act(async () => button('Save').props.onPress());
  }
  expect(tree.root.findAllByType('DateTimePicker')).toHaveLength(0);
  await act(async () => button('1965-02-12').props.onPress());
  picker = tree.root.findByType('DateTimePicker');
  expect(picker.props.value).toEqual(earlier);
  const later = new Date(1990, 10, 25);
  await act(async () => picker.props.onChange({ type: 'set' }, later));
  if (os === 'ios') await act(async () => button('Save').props.onPress());
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: '1990-11-25' }));
});

test('Android Cancel leaves the saved birth date unchanged', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  await render();
  await act(async () => button('1990-01-01').props.onPress());
  await act(async () => tree.root.findByType('DateTimePicker').props.onChange({ type: 'dismissed' }, new Date(2008, 7, 20)));
  expect(tree.root.findAllByType('DateTimePicker')).toHaveLength(0);
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: '1990-01-01' }));
});

test.each([
  ['2008-08-20', true],
  ['2008-08-21', false],
])('birth date %s respects the existing minimum age at the calendar-day boundary', async (value, allowed) => {
  mockDriver.dateOfBirth = value;
  await render();
  await act(async () => button('Continue to Vehicle & Documents').props.onPress());
  if (allowed) expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ dateOfBirth: value }));
  else {
    expect(mockSave).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Driver must be at least 18 years old.')).toBe(true);
  }
});
