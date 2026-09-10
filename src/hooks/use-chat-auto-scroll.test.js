import React, { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';
import { Keyboard } from 'react-native';
import { useChatAutoScroll } from './use-chat-auto-scroll';

let controller;
let frames;
let events;
let removals;
let tree;
function Harness({ roomId = 'room' }) {
  const result = useChatAutoScroll(roomId);
  useEffect(() => { controller = result; }, [result]);
  return null;
}
const flushFrame = () => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach(callback => callback(0));
};
const historyPosition = { nativeEvent: { contentSize: { height: 2000 }, contentOffset: { y: 300 }, layoutMeasurement: { height: 500 } } };
beforeEach(() => {
  frames = new Map();
  events = {};
  removals = [];
  let frameId = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback);
    return frameId;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
    events[name] = callback;
    const remove = jest.fn();
    removals.push(remove);
    return { remove };
  });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});
async function render() {
  await act(async () => { tree = create(<Harness />); });
  const scrollToEnd = jest.fn();
  controller.listRef.current = { scrollToEnd };
  flushFrame();
  scrollToEnd.mockClear();
  return scrollToEnd;
}
it('scrolls again after the keyboard reduces the viewport, keeping the last message visible', async () => {
  const scroll = await render();
  let viewportHeight = 700;
  let offset = 0;
  scroll.mockImplementation(() => { offset = 2000 - viewportHeight; });
  controller.onInputFocus();
  expect(scroll).not.toHaveBeenCalled();
  flushFrame();
  expect(offset).toBe(1300);
  viewportHeight = 320;
  events.keyboardDidShow();
  controller.scrollAfterLayout();
  flushFrame();
  expect(offset + viewportHeight).toBe(2000);
  expect(scroll).toHaveBeenLastCalledWith({ animated: false });
});
it('keeps the bottom visible when the composer or attachment content grows', async () => {
  const scroll = await render();
  controller.onInputFocus();
  flushFrame();
  scroll.mockClear();
  controller.scrollAfterLayout();
  controller.scrollAfterLayout();
  flushFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
});
it('preserves history browsing until the input is focused again', async () => {
  const scroll = await render();
  controller.onScrollBeginDrag();
  controller.onScrollEnd(historyPosition);
  controller.scrollAfterLayout();
  events.keyboardDidShow(); // Other inputs must not pull chat history to the end.
  flushFrame();
  expect(scroll).not.toHaveBeenCalled();
  controller.onInputFocus();
  flushFrame();
  expect(scroll).toHaveBeenCalledTimes(1);
});
it('cancels queued scrolling and removes keyboard listeners on unmount', async () => {
  const scroll = await render();
  controller.onInputFocus();
  await act(async () => tree.unmount());
  tree = undefined;
  flushFrame();
  expect(scroll).not.toHaveBeenCalled();
  expect(removals).toHaveLength(2);
  removals.forEach(remove => expect(remove).toHaveBeenCalledTimes(1));
});
