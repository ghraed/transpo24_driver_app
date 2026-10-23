import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { OmwPlaceField } from './place-field';
import { searchPlacesAutocomplete, resolvePlaceSuggestion } from '@/lib/places';
import * as Location from 'expo-location';
import { resolveOmwCurrentAddress } from './current-location';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { dir: () => 'ltr' } }) }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/lib/places', () => ({ searchPlacesAutocomplete: jest.fn(), resolvePlaceSuggestion: jest.fn() }));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { High: 4 } }));
jest.mock('./current-location', () => ({ resolveOmwCurrentAddress: jest.fn() }));
let tree;
const onChange = jest.fn();
const onResolvingChange = jest.fn();
const gpsPlace = { latitude: 33.89, longitude: 35.5, address: 'Current street, Beirut', placeId: '' };
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: gpsPlace });
  resolveOmwCurrentAddress.mockResolvedValue(gpsPlace);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.useRealTimers(); });
async function render(label = 'From') {
  await act(async () => { tree = create(<OmwPlaceField label={label} value={null} onChange={onChange} onResolvingChange={onResolvingChange} />); });
  await act(async () => tree.root.findByType(TextInput).props.onFocus());
}
async function type(text) {
  await act(async () => tree.root.findByType(TextInput).props.onChangeText(text));
  await act(async () => jest.advanceTimersByTime(350));
}
const choices = () => tree.root.findAll(node => node.props.accessibilityRole === 'button' && !node.props.accessibilityLabel && typeof node.props.onPress === 'function');
const locateButton = () => tree.root.findAll(node => node.props.accessibilityLabel === 'omw.useCurrentLocation' && typeof node.props.onPress === 'function')[0];

test('discards a delayed search response after the driver types a different place', async () => {
  let finishOldSearch;
  searchPlacesAutocomplete.mockReturnValueOnce(new Promise(resolve => { finishOldSearch = resolve; }));
  searchPlacesAutocomplete.mockResolvedValueOnce([{ description: 'Tripoli result', placeId: 'tripoli' }]);
  await render(); await type('Beirut'); await type('Tripoli');
  await act(async () => finishOldSearch([{ description: 'Beirut result', placeId: 'beirut' }]));
  expect(JSON.stringify(tree.toJSON())).toContain('Tripoli result');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Beirut result');
  expect(resolvePlaceSuggestion).not.toHaveBeenCalled();
});

test('requires explicit place selection and ignores delayed details after the text changes', async () => {
  const suggestion = { description: 'Beirut result', placeId: 'beirut' };
  searchPlacesAutocomplete.mockResolvedValue([suggestion]);
  let finishDetails;
  resolvePlaceSuggestion.mockReturnValue(new Promise(resolve => { finishDetails = resolve; }));
  await render(); await type('Beirut');
  expect(onChange).toHaveBeenLastCalledWith(null);
  await act(async () => choices()[0].props.onPress());
  await type('Tripoli');
  const place = { ...suggestion, address: 'Beirut', latitude: 33.89, longitude: 35.5 };
  await act(async () => finishDetails(place));
  expect(onChange).not.toHaveBeenCalledWith(place);
  expect(tree.root.findByType(TextInput).props.value).toBe('Tripoli');
});

test.each(['From', 'To'])('fills %s with the current address after getting location permission', async label => {
  await render(label);
  await act(async () => locateButton().props.onPress());
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High });
  expect(resolveOmwCurrentAddress).toHaveBeenCalledWith(gpsPlace.latitude, gpsPlace.longitude);
  expect(onChange).toHaveBeenCalledWith(gpsPlace);
  expect(tree.root.findByType(TextInput).props.value).toBe(gpsPlace.address);
  expect(onResolvingChange).toHaveBeenCalledWith(true);
  expect(onResolvingChange).toHaveBeenLastCalledWith(false);
});

test('shows permission feedback without reading GPS when permission is denied', async () => {
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
  await render();
  await act(async () => locateButton().props.onPress());
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('omw.locationPermission');
});

test('keeps manual search available when GPS or address resolution fails', async () => {
  Location.getCurrentPositionAsync.mockRejectedValueOnce(new Error('GPS unavailable'));
  await render();
  await act(async () => locateButton().props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain('omw.locationUnavailable');
  resolveOmwCurrentAddress.mockResolvedValueOnce(null);
  await act(async () => locateButton().props.onPress());
  expect(onChange).not.toHaveBeenCalled();
  expect(locateButton().props.disabled).toBe(false);
  expect(tree.root.findByType(TextInput).props.editable).toBe(true);
});

test('ignores a delayed GPS result when the driver types another place', async () => {
  let finishGps;
  Location.getCurrentPositionAsync.mockReturnValueOnce(new Promise(resolve => { finishGps = resolve; }));
  await render();
  await act(async () => locateButton().props.onPress());
  expect(locateButton().props.disabled).toBe(true);
  await act(async () => tree.root.findByType(TextInput).props.onChangeText('Tripoli'));
  await act(async () => finishGps({ coords: gpsPlace }));
  expect(resolveOmwCurrentAddress).not.toHaveBeenCalled();
  expect(tree.root.findByType(TextInput).props.value).toBe('Tripoli');
  expect(onChange).not.toHaveBeenCalledWith(gpsPlace);
});
