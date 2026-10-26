import React from 'react';
import { act, create } from 'react-test-renderer';
import { Platform, Text } from 'react-native';
import { DateTimePickerDialog } from './date-time-picker-dialog';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

let tree;
const originalOS = Platform.OS;
const date = new Date(2026, 7, 20, 15, 30);
const onConfirm = jest.fn();
const onCancel = jest.fn();
const picker = () => tree.root.findByType('DateTimePicker');
const press = async label => {
  let node = tree.root.findAllByType(Text).find(node => node.props.children === label);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  await act(async () => node.props.onPress());
};
async function render(os, props = {}) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  await act(async () => { tree = create(<DateTimePickerDialog value={date} mode="date" onConfirm={onConfirm} onCancel={onCancel} {...props} />); });
}
beforeEach(() => { onConfirm.mockClear(); onCancel.mockClear(); });
afterEach(async () => {
  await act(async () => tree?.unmount());
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
});

test.each(['date', 'time'])('iOS allows repeated %s edits before saving the final selection', async mode => {
  await render('ios', { mode });
  const first = new Date(2026, 7, 21, 16, 35);
  const final = new Date(2026, 7, 22, 17, 40);
  await act(async () => picker().props.onChange({ type: 'set' }, first));
  await act(async () => picker().props.onChange({ type: 'set' }, final));
  expect(picker().props.value).toEqual(final);
  expect(onConfirm).not.toHaveBeenCalled();
  await press('Save');
  expect(onConfirm).toHaveBeenCalledWith(final);
});

test('iOS Cancel discards a changed draft', async () => {
  await render('ios');
  await act(async () => picker().props.onChange({ type: 'set' }, new Date(2026, 7, 21)));
  await press('Cancel');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('Android confirms an older birth date and uses separate day, month and year controls', async () => {
  await render('android', { value: new Date(2008, 7, 20), minimumDate: new Date(1900, 0, 1), maximumDate: new Date(2008, 7, 20) });
  expect(picker().props.display).toBe('spinner');
  const older = new Date(1965, 1, 12);
  await act(async () => picker().props.onChange({ type: 'set' }, older));
  expect(onConfirm).toHaveBeenCalledWith(older);
});

test.each(['dismissed', 'neutralButtonPressed'])('Android %s never commits the initial date', async type => {
  await render('android');
  // Android includes the original date in a dismissal event.
  await act(async () => picker().props.onChange({ type }, date));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

test('an unrelated parent render does not reset the open Android picker', async () => {
  await render('android');
  const callback = picker().props.onChange;
  const latestConfirm = jest.fn();
  await act(async () => tree.update(<DateTimePickerDialog value={new Date(2026, 7, 22)} mode="date" onConfirm={latestConfirm} onCancel={() => {}} />));
  expect(picker().props.onChange).toBe(callback);
  expect(picker().props.value).toEqual(date);
  await act(async () => callback({ type: 'set' }, date));
  expect(latestConfirm).toHaveBeenCalledWith(date);
});

test('restored dates outside the allowed range open at an editable valid date', async () => {
  const maximum = new Date(2008, 7, 20);
  await render('android', { maximumDate: maximum });
  expect(picker().props.value).toEqual(maximum);
});
