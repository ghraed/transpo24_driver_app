import { jest, test, expect, afterEach } from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import EditNicknameScreen from '@/app/edit-nickname';

const mockBack = jest.fn();
const mockSave = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ driver: { nickname: 'Old Nickname' }, saveDriverNickname: mockSave }) }));
let tree;
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.clearAllMocks();
});

test('prefills the nickname, rejects blank input, and saves a trimmed nickname', async () => {
  await act(async () => { tree = create(<EditNicknameScreen />); });
  const input = () => tree.root.findByType(TextInput);
  expect(input().props.value).toBe('Old Nickname');
  const save = () => tree.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress();
  await act(async () => { input().props.onChangeText(' '); });
  await act(async () => { save(); });
  expect(mockSave).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Nickname must be between 2 and 40 characters.');
  mockSave.mockResolvedValue({ driver: { nickname: 'Night Rider' } });
  await act(async () => { input().props.onChangeText(' Night Rider '); });
  await act(async () => { save(); });
  expect(mockSave).toHaveBeenCalledWith('Night Rider');
  expect(mockBack).toHaveBeenCalled();
});

test('keeps the editor open with the entered nickname if saving fails', async () => {
  mockSave.mockRejectedValue(new Error('Connection lost'));
  await act(async () => { tree = create(<EditNicknameScreen />); });
  await act(async () => { tree.root.findByType(TextInput).props.onChangeText('Night Rider'); });
  await act(async () => { tree.root.findAll(node => typeof node.props.onPress === 'function')[0].props.onPress(); });
  expect(mockBack).not.toHaveBeenCalled();
  expect(tree.root.findByType(TextInput).props.value).toBe('Night Rider');
  expect(JSON.stringify(tree.toJSON())).toContain('Connection lost');
});
