import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
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
jest.mock('@react-native-community/datetimepicker', () => () => null);

let tree;
const button = label => {
  let node = tree.root.findAllByType(Text).find(node => node.props.children === label);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  return node;
};
const trnInput = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Tax Registration Number (TRN)');
beforeEach(() => { jest.useFakeTimers(); mockSave.mockClear(); });
afterEach(async () => { await act(async () => tree?.unmount()); jest.useRealTimers(); });
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
