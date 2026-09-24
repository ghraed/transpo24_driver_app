import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Screen from '../src/app/trip-expenses';
import { createAdditionalExpense } from '@/services/tripService';

const mockRouter = { back: jest.fn(), replace: jest.fn() };
let mockTripId = 'swiss-job';
const mockT = (key, values) => values ? key.replace('{{amount}}', values.amount) : key;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ tripId: mockTripId }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/services/tripService', () => ({ createAdditionalExpense: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
const receipt = { uri: 'file:///receipt.jpg', fileName: 'receipt.jpg', mimeType: 'image/jpeg', width: 800, height: 600 };
let tree;
const output = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => typeof node.props.onPress === 'function').find(node => node.findAllByType(Text).some(text => text.props.children === label));
async function press(label) { await act(async () => button(label).props.onPress()); }
async function render() { await act(async () => { tree = create(<Screen />); }); }
async function fill({ amount = '25', reason = ' Parking ', photo = true } = {}) {
  await act(async () => {
    const inputs = tree.root.findAllByType(TextInput);
    inputs[0].props.onChangeText(amount);
    inputs[1].props.onChangeText(reason);
    inputs[2].props.onChangeText(' Parking meter ');
  });
  if (photo) await press('Choose Image');
}
beforeEach(() => {
  jest.resetAllMocks(); mockTripId = 'swiss-job';
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [receipt] });
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [receipt] });
  createAdditionalExpense.mockResolvedValue({ totalChargeAmount: 28, currency: 'EUR' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

it('submits the selected currency and receipt to the exact foreign job, then shows the server total', async () => {
  await render(); await fill(); await press('EUR'); await press('Submit Expense');
  expect(createAdditionalExpense).toHaveBeenCalledWith('swiss-job', {
    amount: 25, currency: 'EUR', reason: 'Parking', equipmentType: 'Parking meter', invoicePhoto: receipt,
  });
  expect(output()).toContain(new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(28));
  expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('');
  expect(button('Remove Photo')).toBeUndefined();
});
it.each([
  [{ amount: '0' }, 'Expense amount must be greater than 0.'],
  [{ amount: 'invalid' }, 'Expense amount must be greater than 0.'],
  [{ reason: '  ' }, 'Expense reason is required.'],
  [{ photo: false }, 'Invoice / receipt photo is required.'],
])('rejects incomplete expense input %j', async (values, message) => {
  await render(); await fill(values); await press('Submit Expense');
  expect(createAdditionalExpense).not.toHaveBeenCalled(); expect(output()).toContain(message);
});
it('rejects a missing trip and returns through router back', async () => {
  mockTripId = ''; await render(); await fill(); await press('Submit Expense');
  expect(createAdditionalExpense).not.toHaveBeenCalled(); expect(output()).toContain('Trip ID is missing.');
  await press('Back to Active Trip'); expect(mockRouter.back).toHaveBeenCalled();
});
it('preserves the receipt and amount after server denial so the driver can explicitly retry', async () => {
  createAdditionalExpense.mockRejectedValueOnce(new Error('Request access denied'));
  await render(); await fill(); await press('Submit Expense');
  expect(output()).toContain('Request access denied'); expect(output()).not.toContain('Expense submitted.');
  expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('25');
  expect(button('Remove Photo')).toBeDefined();
  await press('Submit Expense'); expect(createAdditionalExpense).toHaveBeenCalledTimes(2);
  expect(output()).not.toContain('Request access denied'); expect(output()).toContain('Expense submitted.');
});
it('disables submission while the expense upload is pending', async () => {
  let resolveUpload;
  createAdditionalExpense.mockImplementation(() => new Promise(resolve => { resolveUpload = resolve; }));
  await render(); await fill(); await press('Submit Expense');
  expect(button('Submitting Expense...').props.disabled).toBe(true);
  await act(async () => resolveUpload({ totalChargeAmount: 28, currency: 'CHF' }));
  expect(button('Submit Expense').props.disabled).toBe(false);
});
it.each([
  ['Take Photo', ImagePicker.requestCameraPermissionsAsync, ImagePicker.launchCameraAsync],
  ['Choose Image', ImagePicker.requestMediaLibraryPermissionsAsync, ImagePicker.launchImageLibraryAsync],
])('handles denied permission for %s without opening the picker', async (label, permission, launch) => {
  permission.mockResolvedValue({ status: 'denied' });
  await render(); await press(label);
  expect(launch).not.toHaveBeenCalled(); expect(output()).toContain('permission is required');
  expect(button('Remove Photo')).toBeUndefined();
});
it('handles cancelled receipt selection and requires proof again after removal', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: null });
  await render(); await fill(); expect(button('Remove Photo')).toBeUndefined();
  await press('Take Photo'); expect(button('Remove Photo')).toBeDefined();
  await press('Remove Photo'); await press('Submit Expense');
  expect(createAdditionalExpense).not.toHaveBeenCalled(); expect(output()).toContain('Invoice / receipt photo is required.');
});
