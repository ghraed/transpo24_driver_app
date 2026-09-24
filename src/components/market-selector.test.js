import React from 'react';
import { act, create } from 'react-test-renderer';
import { MarketSelector } from './market-selector';
import { fetchMarkets, getSelectedMarket, saveSelectedMarket } from '@/lib/markets';
jest.mock('@/lib/markets', () => ({ fetchMarkets: jest.fn(), getSelectedMarket: jest.fn(), saveSelectedMarket: jest.fn(async () => undefined) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
beforeEach(() => jest.clearAllMocks());
const markets = [{ code: 'FR', name: 'France' }, { code: 'LB', name: 'Lebanon' }];
it('restores an active saved selection and lets the user explicitly change it', async () => {
  fetchMarkets.mockResolvedValue(markets); getSelectedMarket.mockResolvedValue('FR');
  const onChange = jest.fn(); let tree;
  await act(async () => { tree = create(<MarketSelector value="FR" onChange={onChange} disabled={false} />); });
  expect(onChange).toHaveBeenCalledWith('FR');
  await act(async () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button')[0].props.onPress());
  const choice = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button').find(node => node.props.accessibilityLabel === 'Lebanon (LB)');
  await act(async () => choice.props.onPress());
  expect(saveSelectedMarket).toHaveBeenCalledWith('LB');
  expect(onChange).toHaveBeenLastCalledWith('LB');
  await act(async () => tree.unmount());
});
it('does not restore a removed market or choose one automatically', async () => {
  fetchMarkets.mockResolvedValue(markets); getSelectedMarket.mockResolvedValue('CH');
  const onChange = jest.fn(); let tree;
  await act(async () => { tree = create(<MarketSelector value="" onChange={onChange} disabled={false} />); });
  expect(onChange).toHaveBeenCalledWith('');
  await act(async () => tree.unmount());
});
it('offers retry after a market fetch failure', async () => {
  fetchMarkets.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(markets);
  getSelectedMarket.mockResolvedValue('FR');
  const onChange = jest.fn(); let tree;
  await act(async () => { tree = create(<MarketSelector value="" onChange={onChange} disabled={false} />); });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => tree.root.findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole === 'button')[0].props.onPress());
  expect(onChange).toHaveBeenCalledWith('FR');
  await act(async () => tree.unmount());
});
