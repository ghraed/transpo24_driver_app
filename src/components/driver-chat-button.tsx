import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useDriverChatRoom } from '@/hooks/useDriverChatRoom';
import { isTerminalRequestStatus } from '@/lib/request-status';
import type { RequestStatus } from '@/types/auth';
import type { ChatRoom } from '@/types/chat';

type DriverChatButtonProps = {
  transportRequestId: string;
  initialChatRoom?: ChatRoom | null;
  label?: string;
  fullWidth?: boolean;
  showUnavailableState?: boolean;
  requestStatus?: RequestStatus | string | null;
};

export function DriverChatButton({
  transportRequestId,
  initialChatRoom,
  label,
  fullWidth = true,
  showUnavailableState = false,
  requestStatus,
}: DriverChatButtonProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const chatDisabled = isTerminalRequestStatus(requestStatus);
  const {
    chatRoom,
    isLoadingChatRoom,
    chatRoomError,
    refreshChatRoom,
  } = useDriverChatRoom(transportRequestId, initialChatRoom, !chatDisabled);

  if (!chatRoom && !chatRoomError && !isLoadingChatRoom && !showUnavailableState) {
    return null;
  }

  return (
    <View style={[styles.container, fullWidth && styles.fullWidth]}>
      {chatRoom && !chatDisabled ? (
        <Pressable
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: {
                chatRoomId: chatRoom.id,
                transportRequestId: chatRoom.transportRequestId,
              },
            } as unknown as Href)
          }
        >
          <Text style={styles.buttonText}>{label || t('Chat with client')}</Text>
          {typeof chatRoom.unreadCount === 'number' && chatRoom.unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chatRoom.unreadCount > 99 ? '99+' : chatRoom.unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : isLoadingChatRoom ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>{t('Checking chat availability...')}</Text>
        </View>
      ) : chatRoomError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{chatRoomError}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refreshChatRoom()}>
            <Text style={styles.retryButtonText}>{t('Retry chat')}</Text>
          </Pressable>
        </View>
      ) : showUnavailableState ? (
        <View style={styles.unavailableButton}>
          <Text style={styles.unavailableButtonText}>
            {chatDisabled ? t('Chat closed after delivery') : t('Chat unavailable')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  fullWidth: {
    width: '100%',
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  badge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  loadingState: {
    minHeight: 32,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#475569',
    fontSize: 13,
  },
  errorState: {
    gap: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  unavailableButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
});
