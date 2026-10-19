import React from 'react';
import { act, create } from 'react-test-renderer';
import EditNicknameScreen from '@/app/edit-nickname';
const mockRedirect = jest.fn(() => null);
jest.mock('expo-router', () => ({ Redirect: props => mockRedirect(props) }));
test('redirects the retired nickname editor to the profile', async () => {
  let tree;
  await act(async () => { tree = create(<EditNicknameScreen />); });
  expect(mockRedirect).toHaveBeenCalledWith({ href: '/complete-profile' });
  await act(async () => tree.unmount());
});
