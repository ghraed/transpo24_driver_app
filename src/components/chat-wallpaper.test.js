import React from 'react';
import { expect, it } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ChatWallpaper } from './chat-wallpaper';

it('covers the full width and bottom after layout and resizing', async () => {
  let tree;
  await act(async () => { tree = create(<ChatWallpaper />); });
  const measure = (width, height) => tree.root.findAll(node => typeof node.props.onLayout === 'function')[0].props.onLayout({ nativeEvent: { layout: { width, height } } });
  for (const [width, height] of [[390, 900], [430, 1300], [900, 430], [390, 350]]) {
    await act(async () => measure(width, height));
    const tiles = tree.root.findAllByType(SvgXml);
    expect(tiles).toHaveLength(Math.ceil(width / 320) * Math.ceil(height / 320));
    const lastTile = tiles[tiles.length - 1];
    const lastPosition = StyleSheet.flatten(lastTile.props.style);
    expect(lastPosition.left + lastTile.props.width).toBeGreaterThanOrEqual(width);
    expect(lastPosition.top + lastTile.props.height).toBeGreaterThanOrEqual(height);
    expect(lastTile.props.xml).toContain('viewBox="0 0 320 320"');
  }
  await act(async () => tree.unmount());
});
