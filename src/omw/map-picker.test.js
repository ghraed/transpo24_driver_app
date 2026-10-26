import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, TextInput } from 'react-native';
import { OmwMapPicker } from './map-picker';
import { reverseGeocodeCoordinates } from '@/lib/places';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/native-maps', () => ({ NativeMapView: 'MapView', NativeMarker: 'Marker' }));
jest.mock('@/lib/places', () => ({ reverseGeocodeCoordinates: jest.fn() }));
const initial = { latitude: 47.55, longitude: 7.59, address: 'Basel', placeId: 'basel' };
const point = { latitude: 47.49, longitude: 7.61 };
const onConfirm = jest.fn();
const onClose = jest.fn();
let tree;
let searchProps;
const button = label => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
async function render(initialPlace = null) {
  await act(async () => { tree = create(<OmwMapPicker initialPlace={initialPlace} initialCenter={initial}
    renderSearch={props => { searchProps = props; return <TextInput />; }} onConfirm={onConfirm} onClose={onClose} />); });
}
async function tap(coordinate = point) {
  await act(async () => tree.root.findByType('MapView').props.onPress({ nativeEvent: { coordinate } }));
}
beforeEach(() => { jest.clearAllMocks(); reverseGeocodeCoordinates.mockResolvedValue(null); });
afterEach(async () => { await act(async () => tree?.unmount()); });

test('map selection keeps exact coordinates and clears a nearby address place ID', async () => {
  reverseGeocodeCoordinates.mockResolvedValue({ ...initial, address: 'Steinweg 8, Arlesheim', placeId: 'nearby-building' });
  await render();
  expect(button('omw.useThisLocation').props.disabled).toBe(true);
  await tap();
  expect(tree.root.findByType('Marker').props.coordinate).toEqual(expect.objectContaining(point));
  await act(async () => button('omw.useThisLocation').props.onPress());
  expect(onConfirm).toHaveBeenCalledWith({ ...point, address: 'Steinweg 8, Arlesheim', placeId: '' });
});

test('can immediately confirm a pin when reverse geocoding is slow or unavailable', async () => {
  let finish;
  reverseGeocodeCoordinates.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render(); await tap();
  expect(button('omw.useThisLocation').props.disabled).toBe(false);
  await act(async () => button('omw.useThisLocation').props.onPress());
  expect(onConfirm).toHaveBeenCalledWith({ ...point, address: '47.490000, 7.610000', placeId: '' });
  await act(async () => finish({ ...initial, address: 'Late address' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('dragging the pin discards an older address lookup and falls back to coordinates on failure', async () => {
  let finishOld;
  reverseGeocodeCoordinates.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  reverseGeocodeCoordinates.mockRejectedValueOnce(new Error('Geocoding unavailable'));
  await render(initial); await tap();
  const next = { latitude: 47.5, longitude: 7.6 };
  await act(async () => tree.root.findByType('Marker').props.onDragEnd({ nativeEvent: { coordinate: next } }));
  await act(async () => finishOld({ ...initial, address: 'Wrong old address' }));
  expect(JSON.stringify(tree.toJSON())).toContain('omw.mapAddressFallback');
  await act(async () => button('omw.useThisLocation').props.onPress());
  expect(onConfirm).toHaveBeenCalledWith({ ...next, address: '47.500000, 7.600000', placeId: '' });
});

test('search can select a location and cancel leaves the original endpoint unchanged', async () => {
  await render(initial);
  await act(async () => searchProps.onChange({ ...point, address: 'Search result', placeId: 'result' }));
  expect(tree.root.findByType('Marker').props.coordinate.address).toBe('Search result');
  await act(async () => tree.root.findByType(Modal).props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
