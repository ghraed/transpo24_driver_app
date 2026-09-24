import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import Screen from '../src/app/offer-waiting-response';
const mockRouter = { replace: jest.fn() };
const mockT = (key, options) => options?.value ? `${key}: ${options.value}` : key;
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ requestId: 'swiss-job', status: 'QUOTED', offerId: 'offer' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/request-status-display', () => ({ getRequestStatusLabel: value => value }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
let tree;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
it.each([
  ['Back to Available Requests', '/receive-requests'],
  ['Check Accepted Jobs', '/accepted-jobs'],
  ['Go to Driver Home', '/driver-home'],
])('shows the submitted offer and navigates through %s', async (label, route) => {
  await act(async () => { tree = create(<Screen />); });
  const content = JSON.stringify(tree.toJSON());
  expect(content).toContain('swiss-job');
  expect(content).toContain('Offer ID: {{value}}: offer');
  expect(content).toContain('QUOTED');
  const button = tree.root.findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.findAllByType(Text).some(text => text.props.children === label));
  await act(async () => button.props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith(route);
});
