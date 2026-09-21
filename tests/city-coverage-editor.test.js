import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import { CityCoverageEditor } from '../src/components/city-coverage-editor';
import { resolvePlaceSuggestion, reverseGeocodeCoordinates, searchPlacesAutocomplete } from '@/lib/places';

const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/components/native-maps', () => ({ NativeMapView: 'MapView', NativeMarker: 'Marker' }));
jest.mock('@/lib/places', () => ({ resolvePlaceFromQuery: jest.fn(), resolvePlaceSuggestion: jest.fn(), reverseGeocodeCoordinates: jest.fn(), searchPlacesAutocomplete: jest.fn() }));
jest.mock('expo-location', () => ({ PermissionStatus: { GRANTED: 'granted' }, Accuracy: { High: 4 }, requestForegroundPermissionsAsync: jest.fn(), hasServicesEnabledAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));

let tree;
const onChange = jest.fn();
const otherPin = { city: 'Beirut', latitude: 33.89, longitude: 35.5 };
const suggestion = { placeId: 'hasbaya', description: 'Hasbaya, Lebanon' };
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  Location.hasServicesEnabledAsync.mockResolvedValue(true);
  Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 33.4, longitude: 35.68 } });
  reverseGeocodeCoordinates.mockResolvedValue({ address: 'Hasbaya address' });
  searchPlacesAutocomplete.mockResolvedValue([suggestion]);
  resolvePlaceSuggestion.mockResolvedValue({ latitude: 33.41, longitude: 35.69, address: 'Selected address' });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.useRealTimers();
});
async function render() {
  await act(async () => { tree = create(<CityCoverageEditor cities={['Hasbaya', 'Beirut']} pins={[otherPin]} radius="300" onChange={onChange} />); });
  await press('Hasbaya');
}
function buttons() { return tree.root.findAll(node => typeof node.props.onPress === 'function'); }
async function press(label) {
  await act(async () => buttons().find(button => button.props.accessibilityLabel === label).props.onPress());
}
async function type(value) {
  await act(async () => tree.root.findByType(TextInput).props.onChangeText(value));
}
it('sets the selected city from GPS and preserves other city pins even when the address lookup fails', async () => {
  reverseGeocodeCoordinates.mockRejectedValue(new Error('Offline'));
  await render();
  await press('Use Current Location');
  expect(onChange).toHaveBeenCalledWith([otherPin, { city: 'Hasbaya', latitude: 33.4, longitude: 35.68 }]);
  expect(tree.root.findByType(TextInput).props.value).toBe('Current location');
});
it.each(['denied', 'services disabled'])('keeps existing pins when GPS is unavailable: %s', async reason => {
  if (reason === 'denied') Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
  else Location.hasServicesEnabledAsync.mockResolvedValue(false);
  await render();
  await press('Use Current Location');
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});
it('debounces typing and saves coordinates from the chosen address', async () => {
  await render();
  await type('Has');
  await act(async () => jest.advanceTimersByTime(100));
  await type('Hasbaya');
  expect(searchPlacesAutocomplete).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(250));
  expect(searchPlacesAutocomplete).toHaveBeenCalledTimes(1);
  expect(searchPlacesAutocomplete).toHaveBeenCalledWith('Hasbaya');
  await press(suggestion.description);
  expect(resolvePlaceSuggestion).toHaveBeenCalledWith(suggestion);
  expect(onChange).toHaveBeenCalledWith([otherPin, { city: 'Hasbaya', latitude: 33.41, longitude: 35.69 }]);
  expect(tree.root.findByType(TextInput).props.value).toBe('Selected address');
  await act(async () => jest.advanceTimersByTime(300));
  expect(searchPlacesAutocomplete).toHaveBeenCalledTimes(1);
});
it('discards old address suggestions after clearing the field', async () => {
  let finish;
  searchPlacesAutocomplete.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render();
  await type('Hasbaya');
  await act(async () => jest.advanceTimersByTime(250));
  await type('');
  await act(async () => finish([suggestion]));
  expect(buttons().some(button => button.props.accessibilityLabel === suggestion.description)).toBe(false);
});
it('discards a pending GPS result when switching to another city', async () => {
  let finish;
  Location.getCurrentPositionAsync.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => { buttons().find(button => button.props.accessibilityLabel === 'Use Current Location').props.onPress(); });
  await press('Beirut');
  await act(async () => finish({ coords: { latitude: 33.4, longitude: 35.68 } }));
  expect(onChange).not.toHaveBeenCalled();
  expect(tree.root.findByType(TextInput).props.value).toBe('Beirut');
});
