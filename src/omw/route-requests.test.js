import React from 'react';
import { act, create } from 'react-test-renderer';
import { OmwRouteRequests } from './route-requests';
import { Modal, Text, View } from 'react-native';
import { getDriverRouteRequests } from '@/lib/api';
const mockPush = jest.fn();
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { resolvedLanguage: 'en' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: callback => require('react').useEffect(callback, [callback]) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 20 }) }));
jest.mock('@/components/native-maps', () => ({ NativeMarker: 'RequestMarker' }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/use-driver-access', () => ({ useDriverAccess: () => ({ canInteract: true }) }));
jest.mock('@/lib/api', () => ({ getDriverRouteRequests: jest.fn() }));
const route = { coordinates: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }] };
const alert = { requestId: 'job', service: { key: 'GOODS_TRANSPORT', nameEn: 'Goods' }, pickup: { address: 'Pickup town', latitude: 33.8, longitude: 35.5 },
  dropoff: { address: 'Delivery town' }, schedule: { isImmediate: true }, distanceKm: 2 };
let tree;
const copy = () => tree.root.findAllByType(Text).flatMap(node => node.props.children).filter(value => typeof value === 'string').join(' ');
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

async function render(radius = 5) {
  await act(async () => { tree = create(<OmwRouteRequests route={route} radiusKm={radius}>
    {markers => <View testID="map">{markers}</View>}
  </OmwRouteRequests>); });
}
test('shows pickup markers without a request button or popup and opens request details', async () => {
  getDriverRouteRequests.mockResolvedValue({ alerts: [alert] });
  await render();
  expect(getDriverRouteRequests).toHaveBeenCalledWith(route.coordinates, 5);
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(button('omw.requestsTitle')).toBeUndefined();
  const marker = tree.root.findByType('RequestMarker');
  expect(marker.props.coordinate).toEqual({ latitude: 33.8, longitude: 35.5 });
  const stopPropagation = jest.fn();
  await act(async () => marker.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/review-request-details', params: { requestId: 'job' } });
});
test('discards results for an older radius after the radius changes', async () => {
  let finish;
  getDriverRouteRequests.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  getDriverRouteRequests.mockResolvedValue({ alerts: [] });
  await render();
  await act(async () => tree.update(<OmwRouteRequests route={route} radiusKm={1}>
    {markers => <View>{markers}</View>}
  </OmwRouteRequests>));
  await act(async () => finish({ alerts: [alert] }));
  expect(tree.root.findAllByType('RequestMarker')).toHaveLength(0);
});
test('shows a recoverable error and retries loading map markers', async () => {
  getDriverRouteRequests.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ alerts: [alert] });
  await render();
  expect(copy()).toContain('omw.requestsError');
  await act(async () => button('omw.refreshRequests').props.onPress());
  expect(tree.root.findAllByType('RequestMarker')).toHaveLength(1);
  expect(copy()).not.toContain('omw.requestsError');
});
