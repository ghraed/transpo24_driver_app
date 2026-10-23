import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  DriverButton,
  DriverCard,
  DriverIcon,
  DriverStatus,
  DriverText,
} from '@/components/ui/driver-ui';
import { useDriverChatRoom } from '@/hooks/useDriverChatRoom';
import { isTerminalRequestStatus } from '@/lib/request-status';
import { driverRadius, driverSpace, useDriverColors } from '@/theme/driver-theme';
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
  const colors = useDriverColors();
  const chatDisabled = isTerminalRequestStatus(requestStatus);
  const { chatRoom, isLoadingChatRoom, chatRoomError, isChatPending, chatSecondsRemaining, refreshChatRoom } =
    useDriverChatRoom(transportRequestId, initialChatRoom, !chatDisabled);
  const available = Boolean(chatRoom && !chatDisabled);
  if (!available && !chatRoomError && !isLoadingChatRoom && !isChatPending && !showUnavailableState)
    return null;

  return (
    <DriverCard style={!fullWidth ? styles.intrinsic : undefined}>
      <View style={styles.row}>
        <View
          style={[
            styles.icon,
            { backgroundColor: available ? colors.primarySoft : colors.surfaceSubtle },
          ]}
        >
          <DriverIcon
            name={
              isChatPending
                ? { ios: 'clock', android: 'schedule', web: 'schedule' }
                : { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }
            }
            color={colors.text}
            size={22}
          />
        </View>
        <View style={styles.copy}>
          <DriverText variant="section">{t('pickupUi.clientChat')}</DriverText>
          <DriverText variant="caption" secondary>
            {isChatPending
              ? typeof chatSecondsRemaining === 'number'
                ? t('pickupUi.chatCountdown', { time: `${Math.floor(chatSecondsRemaining / 60)}:${String(chatSecondsRemaining % 60).padStart(2, '0')}` })
                : t('pickupUi.chatWaiting')
              : available
                ? t('pickupUi.chatReady')
                : isLoadingChatRoom
                  ? t('Checking chat availability...')
                  : chatDisabled
                    ? t('Chat closed after delivery')
                    : chatRoomError
                      ? t('pickupUi.chatConnectionIssue')
                      : t('Chat unavailable')}
          </DriverText>
        </View>
        {isChatPending ? (
          <DriverStatus label={t('pickupUi.pending')} />
        ) : available && (chatRoom?.unreadCount ?? 0) > 0 ? (
          <DriverStatus
            label={t('pickupUi.unread', { count: Math.min(chatRoom?.unreadCount ?? 0, 99) })}
            tone="success"
          />
        ) : null}
      </View>
      {available && chatRoom ? (
        <DriverButton
          variant="contact"
          label={
            label ||
            (chatRoom.clientNickname
              ? t('Chat with {{name}}', { name: chatRoom.clientNickname })
              : t('Chat with client'))
          }
          icon={{ ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }}
          onPress={() =>
            router.push({
              pathname: '/chat',
              params: { chatRoomId: chatRoom.id, transportRequestId: chatRoom.transportRequestId },
            } as unknown as Href)
          }
        />
      ) : !chatDisabled && (isChatPending || chatRoomError || isLoadingChatRoom) ? (
        <DriverButton
          variant="quiet"
          loading={isLoadingChatRoom}
          label={
            isChatPending
              ? t('pickupUi.checkAvailability')
              : isLoadingChatRoom
                ? t('Checking chat availability...')
                : t('Retry chat')
          }
          icon={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
          onPress={() => void refreshChatRoom()}
        />
      ) : null}
    </DriverCard>
  );
}
const styles = StyleSheet.create({
  intrinsic: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: driverSpace.md, flexWrap: 'wrap' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: driverRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 120, gap: driverSpace.xs },
});
