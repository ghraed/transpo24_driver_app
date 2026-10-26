import React from 'react';
import { act, create } from 'react-test-renderer';
import { FlatList, Modal, Text, TextInput } from 'react-native';
import { DriverPhoneAuthScreen } from './driver-phone-auth-screen';
import { CountryPicker } from './country-picker';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSendCode = jest.fn(async () => ({}));
const mockLanguage = { locale: 'en', isRTL: false, hasSavedLanguage: true };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => mockLanguage }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ continueWithTrustedSession: jest.fn() }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/auth-storage', () => ({ readTrustedDriverSession: jest.fn(async () => null) }));
jest.mock('@/lib/api', () => ({ sendDriverPhoneVerificationCode: (...args) => mockSendCode(...args) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

let tree;
const input = label => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label);
const button = label => {
  let node = tree.root.findAllByType(Text).find(node => node.props.children === label);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  return node;
};
const trigger = () => tree.root.findAll(node => node.props.accessibilityState?.expanded !== undefined && typeof node.props.onPress === 'function')[0];
const search = async query => { await act(async () => input('Search countries').props.onChangeText(query)); };
const choose = async code => {
  const list = tree.root.findByType(FlatList);
  const item = list.props.data.find(item => item.code === code);
  expect(item).toBeDefined();
  await act(async () => list.props.renderItem({ item }).props.onPress());
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguage.locale = 'en';
  mockLanguage.isRTL = false;
});
afterEach(async () => { await act(async () => tree?.unmount()); });

test.each(['login', 'register'])('%s uses the selected country prefix in the verification request', async mode => {
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode={mode} />); });
  expect(input('Country calling code')).toBeUndefined();
  expect(trigger().props.accessibilityLabel).toContain('+961');
  await act(async () => trigger().props.onPress());
  for (const query of ['Germany', 'DE', '+49', '49']) {
    await search(query);
    const codes = tree.root.findByType(FlatList).props.data.map(item => item.code);
    expect(codes).toEqual(query === 'DE' ? ['DK', 'DE', 'SE'] : ['DE']);
  }
  await choose('DE');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  expect(trigger().props.accessibilityLabel).toContain('+49');
  await act(async () => input('Phone number').props.onChangeText('01701234567'));
  if (mode === 'register') {
    const checkbox = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function')[0];
    await act(async () => checkbox.props.onPress());
  }
  await act(async () => button('Send verification code').props.onPress());
  expect(mockSendCode).toHaveBeenCalledWith({ phoneNumber: '+491701234567' });
  expect(mode === 'login' ? mockPush : mockReplace).toHaveBeenCalledWith({
    pathname: '/verify-phone', params: { phoneNumber: '+491701234567' },
  });
  await act(async () => trigger().props.onPress());
  expect(input('Search countries').props.value).toBe('');
  expect(tree.root.findByType(FlatList).props.data.length).toBeGreaterThan(1);
  expect(tree.root.findByType(FlatList).props.data.every(item => /^\+\d+$/.test(item.callingCode))).toBe(true);
});

test('Arabic search selects a country and closing clears the filter', async () => {
  mockLanguage.locale = 'ar';
  mockLanguage.isRTL = true;
  await act(async () => { tree = create(<CountryPicker value="LB" onChange={jest.fn()} displayMode="callingCode" />); });
  await act(async () => trigger().props.onPress());
  await search('ألمانيا');
  expect(tree.root.findByType(FlatList).props.data.map(item => item.code)).toEqual(['DE']);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  await act(async () => trigger().props.onPress());
  expect(input('Search countries').props.value).toBe('');
});

test('the profile country picker keeps its country-name display', async () => {
  const onChange = jest.fn();
  await act(async () => { tree = create(<CountryPicker value="LB" onChange={onChange} />); });
  expect(tree.root.findAllByType(Text).some(node => node.props.children === 'Lebanon')).toBe(true);
  await act(async () => trigger().props.onPress());
  await search('France');
  await choose('FR');
  expect(onChange).toHaveBeenCalledWith('FR');
});
