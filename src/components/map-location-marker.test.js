import React from 'react';
import { act, create } from 'react-test-renderer';
import { MapLocationMarker } from './map-location-marker';

jest.mock('./native-maps', () => ({ NativeMarker: 'Marker' }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }));

let tree;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
const coordinate = { latitude: 33.89, longitude: 35.5 };

test('driver uses a blue dot with a small halo centered on its coordinate', async () => {
  await act(async () => { tree = create(<MapLocationMarker kind="driver" coordinate={coordinate} title="Driver" />); });
  expect(tree.root.findByType('Marker').props).toMatchObject({ coordinate, anchor: { x: 0.5, y: 0.5 } });
  expect(tree.root.findAllByType('Circle').map(node => ({ r: node.props.r, fill: node.props.fill }))).toEqual([
    { r: 18, fill: 'rgba(66, 133, 244, 0.16)' }, { r: 8, fill: '#4285F4' },
  ]);
});

test('pickup and dropoff use consistent pins with distinct colors and center symbols', async () => {
  const onPress = jest.fn();
  await act(async () => { tree = create(<MapLocationMarker kind="pickup" coordinate={coordinate} title="Pickup" onPress={onPress} />); });
  expect(tree.root.findByType('Path').props.fill).toBe('#1DB954');
  expect(tree.root.findAllByType('Circle')).toHaveLength(1);
  expect(tree.root.findByType('Marker').props.anchor.y).toBe(42 / 44);
  tree.root.findByType('Marker').props.onPress();
  expect(onPress).toHaveBeenCalledTimes(1);
  await act(async () => tree.update(<MapLocationMarker kind="dropoff" coordinate={coordinate} title="Dropoff" />));
  expect(tree.root.findByType('Path').props.fill).toBe('#FF4B3E');
  expect(tree.root.findAllByType('Rect')).toHaveLength(1);
  expect(tree.root.findAllByType('Circle')).toHaveLength(0);
});
