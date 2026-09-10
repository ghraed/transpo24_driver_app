import { useCallback, useEffect, useRef } from 'react';
import { FlatList, Keyboard, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

// Keep the latest message in view while composing or resizing, but let the
// driver scroll back through history without incoming content pulling it away.
export function useChatAutoScroll<T>(roomId: string | undefined) {
  const listRef = useRef<FlatList<T>>(null);
  const followLatest = useRef(true);
  const inputFocused = useRef(false);
  const pendingFrame = useRef<number | null>(null);

  const cancelScroll = useCallback(() => {
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = null;
  }, []);

  const scrollAfterLayout = useCallback(() => {
    if (!followLatest.current) return;
    cancelScroll();
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      if (followLatest.current) listRef.current?.scrollToEnd({ animated: false });
    });
  }, [cancelScroll]);

  const onInputFocus = useCallback(() => {
    inputFocused.current = true;
    followLatest.current = true;
    scrollAfterLayout();
  }, [scrollAfterLayout]);

  const onInputBlur = useCallback(() => { inputFocused.current = false; }, []);
  const onScrollBeginDrag = useCallback(() => {
    followLatest.current = false;
    cancelScroll();
  }, [cancelScroll]);
  const onScrollEnd = useCallback(({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    followLatest.current = contentSize.height - contentOffset.y - layoutMeasurement.height <= 48;
  }, []);

  useEffect(() => {
    followLatest.current = true;
    scrollAfterLayout();
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      if (inputFocused.current) {
        followLatest.current = true;
        scrollAfterLayout();
      }
    });
    // iOS can change keyboard height without hiding it (predictive text, emoji).
    const changed = Keyboard.addListener('keyboardDidChangeFrame', () => {
      if (inputFocused.current) scrollAfterLayout();
    });
    return () => { shown.remove(); changed.remove(); cancelScroll(); };
  }, [roomId, scrollAfterLayout, cancelScroll]);

  return { listRef, onInputFocus, onInputBlur, scrollAfterLayout, onScrollBeginDrag, onScrollEnd };
}
