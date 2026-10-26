import React from 'react';
import { act, create } from 'react-test-renderer';
import { Modal, TextInput } from 'react-native';
import { OmwPlaceField } from './place-field';
import { searchPlacesAutocomplete, resolvePlaceSuggestion, reverseGeocodeCoordinates } from '@/lib/places';
import * as Location from 'expo-location';
import { resolveOmwCurrentAddress } from './current-location';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT, i18n: { dir: () => 'ltr' } }) }));
jest.mock('@/components/native-maps', () => ({ NativeMapView: 'MapView', NativeMarker: 'Marker' }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/lib/places', () => ({ searchPlacesAutocomplete: jest.fn(), resolvePlaceSuggestion: jest.fn(), reverseGeocodeCoordinates: jest.fn() }));
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


test('the map picker fills the endpoint only after confirmation', async () => {
  reverseGeocodeCoordinates.mockResolvedValue({ ...gpsPlace, address: 'Steinweg 8, Arlesheim' });
  await render('To');
  const mapButton = tree.root.findAll(node => node.props.accessibilityLabel === 'omw.chooseOnMap' && typeof node.props.onPress === 'function')[0];
  await act(async () => mapButton.props.onPress());
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  const coordinate = { latitude: 47.49, longitude: 7.61 };
  await act(async () => tree.root.findByType('MapView').props.onPress({ nativeEvent: { coordinate } }));
  expect(onChange).not.toHaveBeenCalled();
  const confirm = tree.root.findAll(node => node.props.accessibilityLabel === 'omw.useThisLocation' && typeof node.props.onPress === 'function')[0];
  await act(async () => confirm.props.onPress());
  expect(onChange).toHaveBeenCalledWith({ ...coordinate, address: 'Steinweg 8, Arlesheim', placeId: '' });
  expect(tree.root.findAllByType(Modal)).toHaveLength(0);
  expect(tree.root.findByType(TextInput).props.value).toBe('Steinweg 8, Arlesheim');
});

test('searching inside the map picker places a result on the map before confirming it', async () => {
  const suggestion = { description: 'Arlesheim result', placeId: 'arlesheim' };
  const place = { latitude: 47.49, longitude: 7.61, address: 'Steinweg 8, Arlesheim', placeId: 'arlesheim' };
  searchPlacesAutocomplete.mockResolvedValue([suggestion]);
  resolvePlaceSuggestion.mockResolvedValue(place);
  await render('To');
  const mapButton = tree.root.findAll(node => node.props.accessibilityLabel === 'omw.chooseOnMap' && typeof node.props.onPress === 'function')[0];
  await act(async () => mapButton.props.onPress());
  const searchInput = () => tree.root.findAllByType(TextInput)[1];
  await act(async () => searchInput().props.onFocus());
  await act(async () => searchInput().props.onChangeText('Steinweg 8 Arlesheim'));
  await act(async () => jest.advanceTimersByTime(350));
  await act(async () => choices()[0].props.onPress());
  expect(tree.root.findByType('Marker').props.coordinate).toEqual(place);
  expect(onChange).not.toHaveBeenCalled();
  const confirm = tree.root.findAll(node => node.props.accessibilityLabel === 'omw.useThisLocation' && typeof node.props.onPress === 'function')[0];
  await act(async () => confirm.props.onPress());
  expect(onChange).toHaveBeenCalledWith(place);
});
