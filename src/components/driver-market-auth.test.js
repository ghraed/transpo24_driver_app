import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { DriverPhoneAuthScreen } from './driver-phone-auth-screen';
import { MarketSelector } from './market-selector';
import { sendDriverPhoneVerificationCode } from '@/lib/api';
import { readLastOnboardingRoute, readTrustedDriverSession } from '@/lib/auth-storage';
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockContinue = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('@/components/market-selector', () => ({ MarketSelector: () => null }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ continueWithTrustedSession: mockContinue }) }));
jest.mock('@/lib/api', () => ({ sendDriverPhoneVerificationCode: jest.fn() }));
jest.mock('@/lib/auth-storage', () => ({ readTrustedDriverSession: jest.fn(), readLastOnboardingRoute: jest.fn().mockResolvedValue(null) }));
jest.mock('@/localization/provider', () => ({ useAppLanguage: () => ({ hasSavedLanguage: true, isRTL: false }) }));
jest.mock('@/hooks/use-android-keyboard-inset', () => ({ useAndroidKeyboardInset: () => 0 }));
let tree;
beforeEach(() => { jest.clearAllMocks(); readTrustedDriverSession.mockResolvedValue(null); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
it.each(['register'])('requires a market and preserves it through %s OTP navigation', async mode => {
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode={mode} />); });
  const phone = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Phone number');
  await act(async () => phone().props.onChangeText('70123456'));
  await act(async () => phone().props.onSubmitEditing());
  expect(sendDriverPhoneVerificationCode).not.toHaveBeenCalled();
  await act(async () => tree.root.findByType(MarketSelector).props.onChange('FR'));
  if (mode === 'register') await act(async () => tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function')[0].props.onPress());
  await act(async () => phone().props.onSubmitEditing());
  expect(sendDriverPhoneVerificationCode).toHaveBeenCalledWith({ phoneNumber: '+96170123456', marketCode: 'FR' });
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/verify-phone', params: { phoneNumber: '+96170123456', marketCode: 'FR' } });
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
it('continues a trusted session without asking for a market', async () => {
  readTrustedDriverSession.mockResolvedValue({ phoneNumber: '+33123456789' });
  mockContinue.mockResolvedValue({ status: 'unavailable', message: 'Choose your home market' });
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode="login" />); });
  expect(tree.root.findAllByType(MarketSelector)).toHaveLength(0);
  await act(async () => tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockContinue).toHaveBeenCalledWith();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Choose your home market');
});

it('resumes a declined driver at the saved correction step from a trusted session', async () => {
  readTrustedDriverSession.mockResolvedValue({ phoneNumber: '+33123456789' });
  readLastOnboardingRoute.mockResolvedValue('/load-capacity?vehicleId=vehicle-1&flow=onboarding');
  mockContinue.mockResolvedValue({ status: 'restored', nextStep: 'WAITING_APPROVAL', driverStatus: 'REJECTED' });
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode="login" />); });
  await act(async () => tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/load-capacity?vehicleId=vehicle-1&flow=onboarding');
});

it('logs in by phone without a market selector or market payload', async () => {
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode="login" />); });
  expect(tree.root.findAllByType(MarketSelector)).toHaveLength(0);
  const phone = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === 'Phone number');
  await act(async () => phone().props.onChangeText('70123456'));
  await act(async () => phone().props.onSubmitEditing());
  expect(sendDriverPhoneVerificationCode).toHaveBeenCalledWith({ phoneNumber: '+96170123456' });
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/verify-phone', params: { phoneNumber: '+96170123456' } });
});


it('shows the full registration checklist and review timing before phone verification', async () => {
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode="register" />); });
  const rendered = JSON.stringify(tree.toJSON());
  const stages = [
    'Step 1 of 7: Verify phone',
    'Step 2 of 7: Profile',
    'Step 3 of 7: Personal documents',
    'Step 4 of 7: Vehicle details',
    'Step 5 of 7: Load capacity',
    'Step 6 of 7: Admin review',
    'Step 7 of 7: Availability',
  ];
  expect(rendered).toContain('Registration checklist');
  for (const stage of stages) expect(rendered).toContain(stage);
  expect(rendered).toContain('Review times vary. Check your status in the app; you may also receive a notification when a decision is made.');
  expect(rendered).toContain('After approval, set your availability to start receiving requests.');
});

it('does not show registration steps on the login screen', async () => {
  await act(async () => { tree = create(<DriverPhoneAuthScreen mode="login" />); });
  expect(JSON.stringify(tree.toJSON())).not.toContain('Registration checklist');
});
