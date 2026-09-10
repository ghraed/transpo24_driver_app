import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, jest, test } from '@jest/globals';
import { Modal } from 'react-native';
import { BackgroundLocationPrompt } from './background-location-prompt';
import { getBackgroundLocationPrompt, requestBackgroundLocationPrompt } from '@/location/background-location-prompt';
const mockT = value => value;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
let tree;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function open() {
  let result;
  await act(async () => { tree = create(<BackgroundLocationPrompt />); });
  await act(async () => { result = requestBackgroundLocationPrompt(); });
  return { result };
}
const checkbox = () => tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function')[0];
const button = label => tree.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function').find(node => node.findAll(child => child.props.children === label).length);
test('shows an accessible unchecked checkbox and returns the checked Continue choice', async () => {
  const { result } = await open();
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  await act(async () => checkbox().props.onPress());
  expect(checkbox().props.accessibilityState.checked).toBe(true);
  await act(async () => button('Continue').props.onPress());
  await expect(result).resolves.toEqual({ continue: true, dontShowAgain: true });
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
});
test('returns the checked Not now choice without accepting location permission', async () => {
  const { result } = await open();
  await act(async () => checkbox().props.onPress());
  await act(async () => button('Not now').props.onPress());
  await expect(result).resolves.toEqual({ continue: false, dontShowAgain: true });
});
test('resets the checkbox for a later popup and handles the Android back button', async () => {
  const { result } = await open();
  await act(async () => checkbox().props.onPress());
  await act(async () => button('Not now').props.onPress());
  await result;
  let next;
  await act(async () => { next = requestBackgroundLocationPrompt(); });
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  await expect(next).resolves.toEqual({ continue: false, dontShowAgain: false });
});
test('cancels an unanswered popup when its authenticated host unmounts', async () => {
  const { result } = await open();
  await act(async () => tree.unmount()); tree = null;
  await expect(result).resolves.toEqual({ continue: false, dontShowAgain: false });
  expect(getBackgroundLocationPrompt()).toBe(false);
});
