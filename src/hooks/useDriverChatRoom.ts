import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDriverChatRoomByTransportRequestId } from '@/lib/api';
import { getSourceErrorMessage } from '@/localization/response-message';
import type { ChatRoom } from '@/types/chat';

type UseDriverChatRoomResult = {
  chatRoom: ChatRoom | null;
  isLoadingChatRoom: boolean;
  chatRoomError: string;
  refreshChatRoom: () => Promise<void>;
};

function isMissingChatRoomError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('not found') ||
    normalized.includes('cannot get') ||
    normalized.includes('no chat room') ||
    normalized.includes('chat unavailable') ||
    normalized.includes('unauthorized')
  );
}

export function useDriverChatRoom(
  transportRequestId: string,
  initialChatRoom?: ChatRoom | null,
  enabled = true,
): UseDriverChatRoomResult {
  const { t } = useTranslation();
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(initialChatRoom ?? null);
  const [isLoadingChatRoom, setIsLoadingChatRoom] = useState<boolean>(false);
  const [chatRoomError, setChatRoomError] = useState<string>('');

  const refreshChatRoom = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setChatRoom(null);
      setChatRoomError('');
      setIsLoadingChatRoom(false);
      return;
    }

    if (!transportRequestId.trim()) {
      setChatRoom(null);
      setChatRoomError(t('Missing transport request id.'));
      return;
    }

    setIsLoadingChatRoom(true);
    setChatRoomError('');

    try {
      const nextRoom = await getDriverChatRoomByTransportRequestId(transportRequestId);
      setChatRoom(nextRoom);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load chat room.');
      if (isMissingChatRoomError(getSourceErrorMessage(error, message))) {
        setChatRoom(null);
        setChatRoomError('');
      } else {
        setChatRoomError(message);
      }
    } finally {
      setIsLoadingChatRoom(false);
    }
  }, [enabled, t, transportRequestId]);

  useFocusEffect(
    useCallback(() => {
      void refreshChatRoom();
    }, [refreshChatRoom]),
  );

  return {
    chatRoom,
    isLoadingChatRoom,
    chatRoomError,
    refreshChatRoom,
  };
}
