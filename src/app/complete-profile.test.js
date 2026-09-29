import React from 'react';
import { act, create } from 'react-test-renderer';

import CompleteProfileScreen from './complete-profile';
import {
  clearCompleteProfileDraft,
  persistCompleteProfileDraft,
  readCompleteProfileDraft,
} from '@/lib/auth-storage';

const mockRouter = { replace: jest.fn() };
const mockT = key => key;
const mockDriver = {
  nickname: 'Server Nick',
  firstName: 'Server First',
  lastName: 'Driver',
  phone: '+96170123456',
  countryCode: 'LB',
  city: 'Beirut',
  fullNameOnId: 'Server First Driver',
  idOrResidencyNumberMasked: '***1234',
  dateOfBirth: '1990-01-01T00:00:00.000Z',
};
let mockCurrentDriver = mockDriver;
const mockRefreshDriverMe = jest.fn();
const mockSaveDriverProfile = jest.fn();
let mockDraftValue = null;

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    driver: mockCurrentDriver,
    refreshDriverMe: mockRefreshDriverMe,
    saveDriverProfile: mockSaveDriverProfile,
    signOut: jest.fn(),
  }),
}));
jest.mock('@/components/country-picker', () => ({ CountryPicker: () => null }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
jest.mock('@/lib/auth-storage', () => ({
  readCompleteProfileDraft: jest.fn(async () => mockDraftValue),
  persistCompleteProfileDraft: jest.fn(async value => { mockDraftValue = value; }),
  clearCompleteProfileDraft: jest.fn(async () => { mockDraftValue = null; }),
  persistLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
  clearLastOnboardingRoute: jest.fn().mockResolvedValue(undefined),
}));

let tree;
beforeEach(() => {
  jest.clearAllMocks();
  mockDraftValue = null;
  mockCurrentDriver = mockDriver;
  mockRefreshDriverMe.mockResolvedValue({ driver: mockDriver });
  mockSaveDriverProfile.mockResolvedValue({ nextStep: 'UPLOAD_DOCUMENTS' });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

const renderScreen = async () => {
  await act(async () => { tree = create(<CompleteProfileScreen />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
};
const input = placeholder => tree.root.findAll(node => node.props.placeholder === placeholder && typeof node.props.onChangeText === 'function')[0];
const continueButton = () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAllByType && node.findAllByType('Text').some(child => child.props.children === 'Continue to Vehicle & Documents'))[0];

it('restores only locally edited fields over the server profile after reopening', async () => {
  mockDraftValue = JSON.stringify({ nickname: 'Draft Nick' });
  await renderScreen();
  expect(readCompleteProfileDraft).toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Step 2 of 7: Profile');
  expect(input('Nickname').props.value).toBe('Draft Nick');
  expect(input('First name').props.value).toBe('Server First');

  await act(async () => input('First name').props.onChangeText('Edited First'));
  expect(JSON.parse(mockDraftValue)).toEqual({ nickname: 'Draft Nick', firstName: 'Edited First' });
  expect(persistCompleteProfileDraft).toHaveBeenCalled();

  await act(async () => tree.unmount());
  tree = null;
  await renderScreen();
  expect(input('Nickname').props.value).toBe('Draft Nick');
  expect(input('First name').props.value).toBe('Edited First');
});

it('clears the draft only after a successful profile save', async () => {
  mockDraftValue = JSON.stringify({ nickname: 'Draft Nick' });
  await renderScreen();
  await act(async () => continueButton().props.onPress());
  expect(mockSaveDriverProfile).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Draft Nick' }));
  expect(clearCompleteProfileDraft).toHaveBeenCalledTimes(1);
  expect(mockDraftValue).toBeNull();
  expect(mockRouter.replace).toHaveBeenCalledWith('/vehicle-documents');
});

it('keeps the draft when saving fails', async () => {
  mockDraftValue = JSON.stringify({ nickname: 'Draft Nick' });
  mockSaveDriverProfile.mockRejectedValue(new Error('Network unavailable'));
  await renderScreen();
  await act(async () => continueButton().props.onPress());
  expect(clearCompleteProfileDraft).not.toHaveBeenCalled();
  expect(JSON.parse(mockDraftValue)).toEqual({ nickname: 'Draft Nick' });
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('keeps the draft when the server still requires profile completion', async () => {
  mockDraftValue = JSON.stringify({ nickname: 'Draft Nick' });
  mockSaveDriverProfile.mockResolvedValue({ nextStep: 'COMPLETE_PROFILE' });
  await renderScreen();
  await act(async () => continueButton().props.onPress());
  expect(clearCompleteProfileDraft).not.toHaveBeenCalled();
  expect(JSON.parse(mockDraftValue)).toEqual({ nickname: 'Draft Nick' });
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('keeps a recovered draft editable when the profile refresh is unavailable', async () => {
  mockCurrentDriver = null;
  mockDraftValue = JSON.stringify({ nickname: 'Offline Nick' });
  mockRefreshDriverMe.mockRejectedValue(new Error('Network unavailable'));
  await renderScreen();
  expect(input('Nickname').props.value).toBe('Offline Nick');
  await act(async () => input('First name').props.onChangeText('Offline First'));
  expect(JSON.parse(mockDraftValue)).toEqual({ nickname: 'Offline Nick', firstName: 'Offline First' });
});

it('ignores a damaged draft and loads the server profile', async () => {
  mockDraftValue = '{invalid';
  await renderScreen();
  expect(input('Nickname').props.value).toBe('Server Nick');
});
