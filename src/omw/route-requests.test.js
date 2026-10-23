import React from 'react';
import { act, create } from 'react-test-renderer';
import { OmwRouteRequests } from './route-requests';
import { getDriverRouteRequests } from '@/lib/api';
const mockPush = jest.fn();
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { resolvedLanguage: 'en' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: callback => require('react').useEffect(callback, [callback]) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/hooks/use-driver-access', () => ({ useDriverAccess: () => ({ canInteract: true }) }));
jest.mock('@/lib/api', () => ({ getDriverRouteRequests: jest.fn() }));
const route = { coordinates: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }] };
const alert = { requestId: 'job', service: { nameEn: 'Goods' }, pickup: { address: 'Pickup town' },
  dropoff: { address: 'Delivery town' }, schedule: { isImmediate: true }, distanceKm: 2 };
let tree;
const copy = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
test('loads route requests with the chosen radius and opens request details', async () => {
  getDriverRouteRequests.mockResolvedValue({ alerts: [alert] });
  await act(async () => { tree = create(<OmwRouteRequests route={route} radiusKm={5} />); });
  expect(getDriverRouteRequests).toHaveBeenCalledWith(route.coordinates, 5);
  expect(copy()).toContain('Pickup town');
  await act(async () => button('omw.viewRequest').props.onPress());
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/review-request-details', params: { requestId: 'job' } });
});
test('discards results for an older radius after the radius changes', async () => {
  let finish;
  getDriverRouteRequests.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  getDriverRouteRequests.mockResolvedValue({ alerts: [] });
  await act(async () => { tree = create(<OmwRouteRequests route={route} radiusKm={5} />); });
  await act(async () => tree.update(<OmwRouteRequests route={route} radiusKm={1} />));
  await act(async () => finish({ alerts: [alert] }));
  expect(copy()).not.toContain('Pickup town');
  expect(copy()).toContain('omw.noRequests');
});
test('shows a recoverable error and retries', async () => {
  getDriverRouteRequests.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ alerts: [] });
  await act(async () => { tree = create(<OmwRouteRequests route={route} radiusKm={5} />); });
  expect(copy()).toContain('omw.requestsError');
  await act(async () => button('omw.refreshRequests').props.onPress());
  expect(copy()).toContain('omw.noRequests');
});
