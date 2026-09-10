import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, jest } from '@jest/globals';
import { CityCoverageEditor } from './city-coverage-editor';
import { resolvePlaceFromQuery } from '@/lib/places';
const mockT = key => key;
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }));
jest.mock('@/lib/places', () => ({ resolvePlaceFromQuery: jest.fn() }));
jest.mock('@/components/native-maps', () => ({ NativeMapView: 'MapView', NativeMarker: 'Marker' }));
let tree;
const onChange = jest.fn();
const pins = [{ city: 'Zurich', latitude: 47.38, longitude: 8.54 }];
beforeEach(() => { jest.clearAllMocks(); resolvePlaceFromQuery.mockResolvedValue({ latitude: 46.2, longitude: 6.14 }); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function render() { await act(async () => { tree = create(<CityCoverageEditor cities={['Zurich', 'Geneva']} country="CH" pins={pins} radius="30" onChange={onChange} />); }); }
function text(node) { return typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node ? text(node.children) : ''; }
async function press(label) {
  const node = tree.root.findAll(n => typeof n.props.onPress === 'function' && text(n.toJSON ? n.toJSON() : { children: n.children }) === label)[0];
  // Composite Pressables can have nested host copies. Either calls the same handler.
  await act(async () => node.props.onPress());
}
it('adds a city pin without replacing another city coverage', async () => {
  await render();
  await press('GenevaSet pin');
  await press('Find coverage pin');
  expect(resolvePlaceFromQuery).toHaveBeenCalledWith('Geneva, CH');
  expect(onChange).toHaveBeenCalledWith([...pins, { city: 'Geneva', latitude: 46.2, longitude: 6.14 }]);
});
it('adjusts an existing city pin by tapping the map', async () => {
  await render();
  await press('ZurichAdjust pin');
  await act(async () => tree.root.findByType('MapView').props.onPress({ nativeEvent: { coordinate: { latitude: 47.4, longitude: 8.6 } } }));
  expect(onChange).toHaveBeenCalledWith([{ city: 'Zurich', latitude: 47.4, longitude: 8.6 }]);
});
it('discards a delayed search response after the driver chooses another city', async () => {
  let resolve;
  resolvePlaceFromQuery.mockReturnValue(new Promise(r => { resolve = r; }));
  await render();
  await press('GenevaSet pin');
  await press('Find coverage pin');
  await press('ZurichAdjust pin');
  await act(async () => resolve({ latitude: 46.2, longitude: 6.14 }));
  expect(onChange).not.toHaveBeenCalled();
});
