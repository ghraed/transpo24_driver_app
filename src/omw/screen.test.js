import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { OmwRouteRequests } from './route-requests';
import DriverOmwScreen from '@/app/driver-omw';
import { OmwProvider } from './context';
import { findOmwRoutes } from './routes';

const mockT = (key, values) => key === 'omw.routeVia' ? `Route ${values.number} via ${values.road}` : key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { resolvedLanguage: 'en' } }) }));
jest.mock('expo-router', () => ({
  Redirect: () => null,
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ accessToken: 'session' }) }));
jest.mock('@/components/driver-bottom-nav', () => ({ DriverBottomNav: () => null, DRIVER_BOTTOM_NAV_HEIGHT: 76 }));
jest.mock('@/components/native-maps', () => ({
  isNativeMapRuntimeAvailable: true,
  NativeMapView: 'MapView',
  // Model native overlays retaining their initial paint until recreated.
  NativePolyline: props => {
    const React = require('react');
    const [paint] = React.useState(() => ({ coordinates: props.coordinates, strokeColor: props.strokeColor,
      strokeWidth: props.strokeWidth, zIndex: props.zIndex }));
    return React.createElement('Polyline', { ...props, ...paint });
  },
}));
jest.mock('@/components/map-location-marker', () => ({ MapLocationMarker: () => null }));
jest.mock('./route-requests', () => ({ OmwRouteRequests: () => null }));
jest.mock('./place-field', () => ({ OmwPlaceField: props => require('react').createElement('PlaceField', props) }));
jest.mock('./routes', () => ({ findOmwRoutes: jest.fn() }));
const from = { address: 'Beirut', placeId: 'beirut', latitude: 33.89, longitude: 35.5 };
const to = { address: 'Tripoli', placeId: 'tripoli', latitude: 34.43, longitude: 35.84 };
const routes = ['Coastal highway', 'Mountain road'].map((summary, index) => ({
  id: String(index), summary, distanceMeters: 80000 + index * 10000, durationSeconds: 3600,
  coordinates: [from, { latitude: 34 + index / 10, longitude: 35.6 }, to],
}));
let tree;
beforeEach(() => { jest.clearAllMocks(); findOmwRoutes.mockResolvedValue(routes); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const copy = () => JSON.stringify(tree.toJSON());
const selectedLine = () => tree.root.findAllByType('Polyline').find(node => node.props.zIndex === 2);
const radios = () => [...new Map(tree.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.selected !== undefined && typeof node.props.onPress === 'function')
  .map(node => [node.props.accessibilityLabel, node])).values()];
function expectOnlySelected(index) {
  expect(radios().map(node => node.props.accessibilityState.checked)).toEqual(routes.map((_, i) => i === index));
  expect(tree.root.findAllByType('Polyline').filter(node => node.props.zIndex === 2)).toHaveLength(1);
  expect(selectedLine().props.coordinates).toEqual(routes[index].coordinates);
}
async function render() { await act(async () => { tree = create(<OmwProvider><DriverOmwScreen /></OmwProvider>); }); }
async function endpoints(destination = to) {
  await act(async () => tree.root.findAllByType('PlaceField')[0].props.onChange(from));
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(destination));
}

test('requires resolved endpoints, lets the driver choose a route, retains it across tabs, and clears it', async () => {
  await render();
  expect(button('omw.findRoutes').props.disabled).toBe(true);
  await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  const choices = tree.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.selected !== undefined && typeof node.props.onPress === 'function');
  await act(async () => choices[choices.length - 1].props.onPress());
  expect(tree.root.findAllByType('Polyline')).toHaveLength(3);
  expect(selectedLine().props.coordinates).toEqual(routes[1].coordinates);
  await act(async () => button('omw.useRoute').props.onPress());
  expect(copy()).toContain('Mountain road');
  expect(copy()).toContain('Coastal highway');
  await act(async () => tree.update(<OmwProvider><React.Fragment /></OmwProvider>));
  await act(async () => tree.update(<OmwProvider><DriverOmwScreen /></OmwProvider>));
  expect(copy()).toContain('Mountain road');
  expect(tree.root.findAllByType('Polyline')).toHaveLength(3);
  expect(selectedLine().props.coordinates).toEqual(routes[1].coordinates);
  expect(button('omw.editTrip')).toBeDefined();
  await act(async () => button('omw.clearTrip').props.onPress());
  expect(button('omw.findRoutes').props.disabled).toBe(true);
  expect(tree.root.findAllByType('PlaceField').every(node => node.props.value === null)).toBe(true);
});

test('rejects identical endpoints and clears obsolete routes when an endpoint changes', async () => {
  await render(); await endpoints(from);
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(findOmwRoutes).not.toHaveBeenCalled();
  expect(copy()).toContain('omw.samePlace');
  await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(button('omw.useRoute')).toBeDefined();
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(null));
  expect(button('omw.useRoute')).toBeUndefined();
});

test('shows an empty result and permits retry after a network failure', async () => {
  await render(); await endpoints();
  findOmwRoutes.mockResolvedValueOnce([]);
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(copy()).toContain('omw.noRoutes');
  findOmwRoutes.mockRejectedValueOnce(new Error('network'));
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(copy()).toContain('omw.routeError');
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(button('omw.useRoute')).toBeDefined();
});

test('ignores delayed route results after an endpoint changes', async () => {
  let finishRoutes;
  findOmwRoutes.mockReturnValueOnce(new Promise(resolve => { finishRoutes = resolve; }));
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  const signal = findOmwRoutes.mock.calls[0][2];
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(null));
  expect(signal.aborted).toBe(true);
  await act(async () => finishRoutes(routes));
  expect(button('omw.useRoute')).toBeUndefined();
  expect(button('omw.findRoutes').props.disabled).toBe(true);
});

test('shows all alternatives in the map viewport and lets the driver switch by tapping a path', async () => {
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  const map = tree.root.findByType('MapView');
  const fitToCoordinates = jest.fn();
  map.props.ref.current = { fitToCoordinates };
  await act(async () => map.props.onMapReady());
  expect(fitToCoordinates).toHaveBeenCalledWith(routes.flatMap(route => route.coordinates), expect.any(Object));
  const alternate = tree.root.findAllByType('Polyline').find(node => node.props.zIndex === 1 && node.props.coordinates !== selectedLine().props.coordinates);
  expect(alternate.props.tappable).toBe(true);
  expect(alternate.props.strokeColor).not.toBe(selectedLine().props.strokeColor);
  await act(async () => alternate.props.onPress());
  expect(selectedLine().props.coordinates).toEqual(routes[1].coordinates);
  await act(async () => button('omw.useRoute').props.onPress());
  expect(button('omw.editTrip')).toBeDefined();
  const other = tree.root.findAllByType('Polyline').find(node => node.props.zIndex === 1 && node.props.coordinates !== selectedLine().props.coordinates);
  await act(async () => other.props.onPress());
  expect(selectedLine().props.coordinates).toEqual(routes[0].coordinates);
  expectOnlySelected(0);
  expect(button('omw.editTrip')).toBeDefined();
  expect(findOmwRoutes).toHaveBeenCalledTimes(1);
});

test('selecting another route deselects the old radio and map path, and replaces the confirmed choice across tabs', async () => {
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  expectOnlySelected(0);
  await act(async () => radios()[1].props.onPress());
  expectOnlySelected(1);
  await act(async () => button('omw.useRoute').props.onPress());
  await act(async () => radios()[0].props.onPress());
  expectOnlySelected(0);
  await act(async () => tree.update(<OmwProvider><React.Fragment /></OmwProvider>));
  await act(async () => tree.update(<OmwProvider><DriverOmwScreen /></OmwProvider>));
  expectOnlySelected(0);
  await act(async () => radios()[1].props.onPress());
  expectOnlySelected(1);
});

test('prevents confirming stale endpoints during location lookup, and removes old routes after GPS resolves', async () => {
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  await act(async () => tree.root.findAllByType('PlaceField')[0].props.onResolvingChange(true));
  expect(button('omw.findRoutes').props.disabled).toBe(true);
  expect(button('omw.useRoute').props.disabled).toBe(true);
  await act(async () => tree.root.findAllByType('PlaceField')[0].props.onChange({ ...from, address: 'Current street', latitude: 33.9, placeId: '' }));
  await act(async () => tree.root.findAllByType('PlaceField')[0].props.onResolvingChange(false));
  expect(tree.root.findAllByType('Polyline')).toHaveLength(0);
  expect(button('omw.useRoute')).toBeUndefined();
  expect(button('omw.findRoutes').props.disabled).toBe(false);
});

test('cycling through three routes never leaves a previous native path green', async () => {
  const third = { ...routes[0], id: '2', summary: 'Inland road',
    coordinates: [from, { latitude: 34.3, longitude: 35.8 }, to] };
  const alternatives = [...routes, third];
  findOmwRoutes.mockResolvedValueOnce(alternatives);
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  const green = selectedLine().props.strokeColor;
  for (const index of [1, 2, 0, 2]) {
    await act(async () => radios()[index].props.onPress());
    const lines = tree.root.findAllByType('Polyline');
    const highlighted = lines.filter(node => node.props.strokeColor === green);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].props.coordinates).toEqual(alternatives[index].coordinates);
    expect(radios().map(node => node.props.accessibilityState.checked))
      .toEqual(alternatives.map((_, i) => i === index));
    expect(new Set(lines.filter(node => node.props.zIndex === 1).map(node => node.props.strokeColor)).size).toBe(1);
  }
});

test('adds an optional via place, routes through it, retains it across tabs, and removes it for direct routing', async () => {
  const via = { address: 'Sidon, Lebanon', latitude: 33.56, longitude: 35.37, placeId: 'sidon' };
  await render(); await endpoints();
  expect(tree.root.findAllByType('PlaceField')).toHaveLength(2);
  expect(button('omw.findRoutes').props.disabled).toBe(false);
  await act(async () => button('omw.addVia').props.onPress());
  expect(tree.root.findAllByType('PlaceField')).toHaveLength(3);
  expect(button('omw.findRoutes').props.disabled).toBe(true);
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(via));
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(findOmwRoutes).toHaveBeenLastCalledWith(from, to, expect.anything(), via);
  await act(async () => button('omw.useRoute').props.onPress());
  expect(copy()).toContain(via.address);
  await act(async () => tree.update(<OmwProvider><React.Fragment /></OmwProvider>));
  await act(async () => tree.update(<OmwProvider><DriverOmwScreen /></OmwProvider>));
  expect(copy()).toContain(via.address);
  await act(async () => button('omw.editTrip').props.onPress());
  expect(tree.root.findAllByType('PlaceField')[1].props.value).toEqual(via);
  await act(async () => button('omw.removeVia').props.onPress());
  expect(tree.root.findAllByType('PlaceField')).toHaveLength(2);
  expect(button('omw.useRoute')).toBeUndefined();
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(findOmwRoutes).toHaveBeenLastCalledWith(from, to, expect.anything(), null);
});

test('removing Via cancels an in-flight route search and discards its old results', async () => {
  const via = { ...from, address: 'Sidon', placeId: 'sidon' };
  let finish;
  findOmwRoutes.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await render(); await endpoints();
  await act(async () => button('omw.addVia').props.onPress());
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(via));
  await act(async () => button('omw.findRoutes').props.onPress());
  const signal = findOmwRoutes.mock.calls[0][2];
  // Editing the via field invalidates an outstanding request even if it resolves late.
  await act(async () => tree.root.findAllByType('PlaceField')[1].props.onChange(null));
  expect(signal.aborted).toBe(true);
  await act(async () => button('omw.removeVia').props.onPress());
  await act(async () => finish(routes));
  expect(button('omw.useRoute')).toBeUndefined();
  expect(button('omw.findRoutes').props.disabled).toBe(false);
});

test('uses a custom route radius, rejects invalid input, and retains the radius with the selected trip', async () => {
  await render(); await endpoints();
  await act(async () => button('omw.findRoutes').props.onPress());
  expect(tree.root.findByType(OmwRouteRequests).props.radiusKm).toBe(5);
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('100'));
  expect(button('omw.useRoute').props.disabled).toBe(true);
  expect(tree.root.findAllByType(OmwRouteRequests)).toHaveLength(0);
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('7.5'));
  expect(tree.root.findByType(OmwRouteRequests).props.radiusKm).toBe(7.5);
  expectOnlySelected(0);
  await act(async () => button('omw.useRoute').props.onPress());
  await act(async () => tree.update(<OmwProvider><React.Fragment /></OmwProvider>));
  await act(async () => tree.update(<OmwProvider><DriverOmwScreen /></OmwProvider>));
  expect(tree.root.findByType(OmwRouteRequests).props.radiusKm).toBe(7.5);
});
