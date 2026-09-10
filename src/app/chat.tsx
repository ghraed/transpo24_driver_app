import { ChatAttachmentGroup } from '@/components/chat-attachment-group';
import { groupChatAttachments, type ChatMessageRow } from '@/lib/chat-attachment-groups';
import { ChatWallpaper } from '@/components/chat-wallpaper';
import { ChatIcon } from '@/components/chat-icon';
import { DriverIcon } from '@/components/driver-icon';
import { ChatAttachment, ChatAttachmentButton } from '@/components/chat-attachment';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import { useChatAutoScroll } from '@/hooks/use-chat-auto-scroll';
import {
  blockDriverChatParticipant,
  getDriverChatMessages,
  getDriverChatRoom,
  getDriverChatRoomByTransportRequestId,
  markDriverChatRoomMessagesRead,
  reportDriverChatParticipant,
  sendDriverChatMessage,
  unblockDriverChatParticipant,
} from '@/lib/api';
import {
  connectSocket,
  isSocketConnected,
  joinChatRoom,
  joinChatRoomWithAck,
  leaveChatRoom,
  onChatMessageCreated,
  onChatMessageRead,
  onSocketDisconnect,
  onSocketError,
  sendChatMessageWithAck,
  waitForSocketConnection,
} from '@/services/socketService';
import { translateDynamicText } from '@/services/translation-service';
import { LANGUAGE_CONFIGS, SUPPORTED_LANGUAGES, type AppLanguage } from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import { getSourceErrorMessage } from '@/localization/response-message';
import type {
  ChatMessage,
  ChatMessageReadEventPayload,
  ChatReportReason,
  ChatRoom,
} from '@/types/chat';

const FIRST_PAGE = 1;
const PAGE_SIZE = 30;
const REPORT_REASONS: { value: ChatReportReason; label: string }[] = [
  { value: 'HARASSMENT', label: 'Harassment or bullying' },
  { value: 'HATE_SPEECH', label: 'Hate speech' },
  { value: 'SEXUAL_CONTENT', label: 'Sexual content' },
  { value: 'THREATS_OR_VIOLENCE', label: 'Threats or violence' },
  { value: 'SPAM_OR_SCAM', label: 'Spam or scam' },
  { value: 'PERSONAL_INFORMATION', label: 'Sharing personal information' },
  { value: 'OTHER', label: 'Other' },
];

type ChatScreenParams = {
  chatRoomId?: string;
  transportRequestId?: string;
};

type TranslatedMessage = {
  language: AppLanguage;
  text: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    const previous = byId.get(message.id);
    byId.set(message.id, previous ? { ...previous, ...message } : message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
}

function normalizeIncomingChatMessage(payload: {
  message?: ChatMessage;
  chatRoomId?: string;
  senderId?: string;
  senderRole?: ChatMessage['senderRole'];
  type?: ChatMessage['type'];
  body?: string | null;
  attachmentUrl?: string | null;
  createdAt?: string;
  readAt?: string | null;
  id?: string;
}): ChatMessage | null {
  if (payload.message) {
    return payload.message;
  }

  if (
    typeof payload.id !== 'string' ||
    typeof payload.chatRoomId !== 'string' ||
    typeof payload.senderId !== 'string' ||
    typeof payload.senderRole !== 'string' ||
    typeof payload.type !== 'string' ||
    typeof payload.createdAt !== 'string'
  ) {
    return null;
  }

  return {
    id: payload.id,
    chatRoomId: payload.chatRoomId,
    senderId: payload.senderId,
    senderRole: payload.senderRole,
    type: payload.type,
    body: payload.body ?? null,
    attachmentUrl: payload.attachmentUrl ?? null,
    createdAt: payload.createdAt,
    readAt: payload.readAt ?? null,
  };
}

function isUnauthorizedTokenError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('invalid or expired token') ||
    normalized.includes('authorization') ||
    normalized.includes('unauthorized')
  );
}

function isChatAccessError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('not found') || normalized.includes('unauthorized');
}

function isAccessibleChatRoom(room: ChatRoom | null): room is ChatRoom {
  return Boolean(room && room.status === 'ACTIVE');
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function containsArabicCharacters(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function containsSpanishMarkers(value: string): boolean {
  return /[ñáéíóúü¡¿]/i.test(value);
}

function containsFrenchMarkers(value: string): boolean {
  return /[àâæçéèêëîïôœùûüÿ]/i.test(value);
}

function containsGermanMarkers(value: string): boolean {
  return /[äöüß]/i.test(value);
}

function containsItalianMarkers(value: string): boolean {
  return /[àìòù]/i.test(value);
}

function buildSourceLanguageCandidates(text: string, targetLanguage: AppLanguage): AppLanguage[] {
  const prioritized: AppLanguage[] = [];

  if (containsArabicCharacters(text)) {
    prioritized.push('ar');
  } else {
    if (containsSpanishMarkers(text)) prioritized.push('es');
    if (containsItalianMarkers(text)) prioritized.push('it');
    if (containsFrenchMarkers(text)) prioritized.push('fr');
    if (containsGermanMarkers(text)) prioritized.push('de');
    prioritized.push('en');
  }

  for (const language of SUPPORTED_LANGUAGES) {
    if (language === targetLanguage || prioritized.includes(language)) {
      continue;
    }
    prioritized.push(language);
  }

  return prioritized.filter((language) => language !== targetLanguage);
}

export default function ChatScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const { accessToken, signOut, user } = useAuth();
  const params = useLocalSearchParams<ChatScreenParams>();
  const initialChatRoomId = typeof params.chatRoomId === 'string' ? params.chatRoomId.trim() : '';
  const transportRequestId =
    typeof params.transportRequestId === 'string' ? params.transportRequestId.trim() : '';

  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(
    initialChatRoomId
      ? {
          id: initialChatRoomId,
          transportRequestId,
          clientId: '',
          driverId: '',
          acceptedOfferId: '',
          status: 'ACTIVE',
          createdAt: '',
          updatedAt: '',
        }
      : null,
  );
  const {
    listRef, onInputFocus, onInputBlur, scrollAfterLayout, onScrollBeginDrag, onScrollEnd,
  } = useChatAutoScroll<ChatMessageRow>(chatRoom?.id);
  const chatContainerRef = useRef<View>(null);
  const [keyboardVerticalOffset, setKeyboardVerticalOffset] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const measureChatOffset = useCallback(() => {
    // Android window measurements exclude the status bar, while keyboard
    // coordinates include it. Also account for banners above the navigator.
    chatContainerRef.current?.measureInWindow((_x, y) => {
      setKeyboardVerticalOffset(y + (Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0));
    });
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [screenError, setScreenError] = useState<string>('');
  const [sendError, setSendError] = useState<string>('');
  const [socketNotice, setSocketNotice] = useState<string>('');
  const [page, setPage] = useState<number>(FIRST_PAGE);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, TranslatedMessage>>({});
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Record<string, boolean>>({});
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<string | undefined>();
  const [reportReason, setReportReason] = useState<ChatReportReason>('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingSafetyAction, setIsSubmittingSafetyAction] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState('');
  const lastReadAtRef = useRef<string | null>(null);
  const chatRoomRef = useRef<ChatRoom | null>(chatRoom);
  const activeLanguageRef = useRef<AppLanguage>(language);
  const translationRequestedMessageIdsRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    chatRoomRef.current = chatRoom;
  }, [chatRoom]);

  useEffect(() => {
    activeLanguageRef.current = language;
    translationRequestedMessageIdsRef.current.clear();
  }, [language]);

  const applyBlockState = useCallback(
    (state: Pick<ChatRoom, 'isBlockedByCurrentUser' | 'isBlockedByOtherUser' | 'canSendMessages'>) => {
      setChatRoom((current) => (current ? { ...current, ...state } : current));
    },
    [],
  );

  const openReportModal = useCallback((messageId?: string) => {
    setReportMessageId(messageId);
    setReportReason('HARASSMENT');
    setReportDetails('');
    setSafetyMessage('');
    setIsReportModalVisible(true);
  }, []);

  const submitReport = useCallback(async (): Promise<void> => {
    if (!chatRoom) return;
    if (reportReason === 'OTHER' && !reportDetails.trim()) {
      setSafetyMessage(t('Please describe what happened.'));
      return;
    }

    setIsSubmittingSafetyAction(true);
    setSafetyMessage('');
    try {
      await reportDriverChatParticipant(chatRoom.id, {
        messageId: reportMessageId,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setIsReportModalVisible(false);
      Alert.alert(
        t('Report submitted'),
        t('Thank you. Our safety team will review this report.'),
      );
    } catch (error) {
      setSafetyMessage(error instanceof Error ? error.message : t('Failed to submit the report.'));
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }, [chatRoom, reportDetails, reportMessageId, reportReason, t]);

  const changeBlockState = useCallback(async (): Promise<void> => {
    if (!chatRoom) return;

    setIsSubmittingSafetyAction(true);
    try {
      const state = chatRoom.isBlockedByCurrentUser
        ? await unblockDriverChatParticipant(chatRoom.id)
        : await blockDriverChatParticipant(chatRoom.id);
      applyBlockState(state);
      Alert.alert(
        chatRoom.isBlockedByCurrentUser ? t('Client unblocked') : t('Client blocked'),
        chatRoom.isBlockedByCurrentUser
          ? t('You can send messages again.')
          : t('Neither participant can send messages in this conversation until you unblock the client.'),
      );
    } catch (error) {
      Alert.alert(
        t('Safety action failed'),
        error instanceof Error ? error.message : t('Please try again.'),
      );
    } finally {
      setIsSubmittingSafetyAction(false);
    }
  }, [applyBlockState, chatRoom, t]);

  const confirmBlockChange = useCallback(() => {
    if (!chatRoom) return;
    const isUnblocking = Boolean(chatRoom.isBlockedByCurrentUser);
    Alert.alert(
      isUnblocking ? t('Unblock client?') : t('Block client?'),
      isUnblocking
        ? t('This will allow messages in this conversation again.')
        : t('Blocking stops both participants from sending messages in this conversation. You can unblock later.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: isUnblocking ? t('Unblock') : t('Block'),
          style: isUnblocking ? 'default' : 'destructive',
          onPress: () => void changeBlockState(),
        },
      ],
    );
  }, [changeBlockState, chatRoom, t]);

  const resolveRoomAndMessages = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setScreenError('');

    try {
      let resolvedRoom = chatRoomRef.current;
      if (!resolvedRoom || !resolvedRoom.driverId || !resolvedRoom.clientId || !resolvedRoom.acceptedOfferId) {
        if (initialChatRoomId) {
          resolvedRoom = await getDriverChatRoom(initialChatRoomId);
        } else if (transportRequestId) {
          resolvedRoom = await getDriverChatRoomByTransportRequestId(transportRequestId);
        } else {
          throw new Error(t('Missing chat room id or transport request id.'));
        }
      }

      if (!isAccessibleChatRoom(resolvedRoom)) {
        setChatRoom(null);
        setMessages([]);
        setScreenError(t('This chat is closed and no longer accessible.'));
        return;
      }

      const response = await getDriverChatMessages(resolvedRoom.id, FIRST_PAGE, PAGE_SIZE);
      if (!isAccessibleChatRoom(response.room ?? resolvedRoom)) {
        setChatRoom(null);
        setMessages([]);
        setScreenError('This chat is closed and no longer accessible.');
        return;
      }

      setChatRoom(response.room ?? resolvedRoom);
      setMessages(mergeMessages([], response.messages ?? []));
      setPage(response.page ?? FIRST_PAGE);
      setHasMore(Boolean(response.hasMore));
      setSendError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to load chat.');
      const sourceMessage = getSourceErrorMessage(error, message);
      if (isUnauthorizedTokenError(sourceMessage) && !isChatAccessError(sourceMessage)) {
        await signOut();
        router.replace('/');
        return;
      }
      setScreenError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initialChatRoomId, router, signOut, t, transportRequestId]);

  const markRead = useCallback(async (roomId: string): Promise<void> => {
    try {
      const response = await markDriverChatRoomMessagesRead(roomId);
      lastReadAtRef.current = response.readAt;
      setChatRoom((current) => (current ? { ...current, unreadCount: 0 } : current));
      setMessages((current) =>
        current.map((message) =>
          message.senderRole === 'CLIENT' && !message.readAt
            ? { ...message, readAt: response.readAt }
            : message,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to mark messages as read.');
      if (!isChatAccessError(getSourceErrorMessage(error, message))) {
        setSocketNotice(message);
      }
    }
  }, [t]);

  const loadMoreMessages = useCallback(async (): Promise<void> => {
    if (!chatRoom || !hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await getDriverChatMessages(chatRoom.id, nextPage, PAGE_SIZE);
      setMessages((current) => mergeMessages(current, response.messages ?? []));
      setPage(response.page ?? nextPage);
      setHasMore(Boolean(response.hasMore));
    } catch (error) {
      setScreenError(error instanceof Error ? error.message : t('Failed to load older messages.'));
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatRoom, hasMore, isLoadingMore, page, t]);

  const applyReadEvent = useCallback((payload: ChatMessageReadEventPayload): void => {
    if (!payload.readAt) return;
    lastReadAtRef.current = payload.readAt;
    setMessages((current) =>
      current.map((message) => {
        if (message.senderRole !== 'DRIVER' || message.readAt) {
          return message;
        }

        if (payload.messageIds?.length && !payload.messageIds.includes(message.id)) {
          return message;
        }

        return { ...message, readAt: payload.readAt };
      }),
    );
  }, []);

  const sendMessage = useCallback(async (): Promise<void> => {
    const trimmedBody = inputValue.trim();
    if (!trimmedBody) {
      setSendError(t('Enter a message before sending.'));
      return;
    }

    if (!isAccessibleChatRoom(chatRoom) || chatRoom.canSendMessages === false) {
      setSendError(t('This chat is closed and no longer accessible.'));
      return;
    }

    setIsSending(true);
    setSendError('');

    try {
      const response = isSocketConnected()
        ? await sendChatMessageWithAck(chatRoom.id, { body: trimmedBody }).catch(() =>
            sendDriverChatMessage(chatRoom.id, { body: trimmedBody }),
          )
        : await sendDriverChatMessage(chatRoom.id, { body: trimmedBody });

      setMessages((current) => mergeMessages(current, [response.message]));
      setInputValue('');
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t('Failed to send message.'));
    } finally {
      setIsSending(false);
    }
  }, [chatRoom, inputValue, t]);

  useFocusEffect(
    useCallback(() => {
      void resolveRoomAndMessages();
    }, [resolveRoomAndMessages]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!accessToken || !chatRoom?.id || !isAccessibleChatRoom(chatRoom)) {
        return undefined;
      }

      let isActive = true;
      let unsubscribeCreated: (() => void) | undefined;
      let unsubscribeRead: (() => void) | undefined;
      let unsubscribeDisconnect: (() => void) | undefined;
      let unsubscribeError: (() => void) | undefined;
      let appStateSubscription: { remove: () => void } | undefined;

      const setupSocket = async (): Promise<void> => {
        try {
          connectSocket(accessToken);
          await waitForSocketConnection(5000);
          await joinChatRoomWithAck(chatRoom.id).catch(() => {
            joinChatRoom(chatRoom.id);
            return { roomId: chatRoom.id };
          });

          if (!isActive) return;

          unsubscribeCreated = onChatMessageCreated((payload) => {
            const nextMessage = normalizeIncomingChatMessage(payload);
            const incomingRoomId = nextMessage?.chatRoomId || payload.roomId || payload.chatRoomId;
            if (incomingRoomId !== chatRoom.id) return;
            if (!nextMessage) return;
            setMessages((current) => mergeMessages(current, [nextMessage]));
            setChatRoom((current) =>
              current ? { ...current, lastMessage: nextMessage } : current,
            );
          });

          unsubscribeRead = onChatMessageRead((payload) => {
            if (payload.roomId !== chatRoom.id) return;
            applyReadEvent(payload);
          });

          unsubscribeDisconnect = onSocketDisconnect(() => {
            setSocketNotice(t('Socket disconnected. Reconnecting...'));
          });

          unsubscribeError = onSocketError((message) => {
            setSocketNotice(message || t('Socket connection error.'));
          });

          setSocketNotice('');
          void markRead(chatRoom.id);
        } catch (error) {
          if (!isActive) return;
          setSocketNotice(error instanceof Error ? error.message : t('Socket connection failed.'));
        }
      };

      void setupSocket();

      appStateSubscription = AppState.addEventListener('change', (nextState) => {
        if (nextState !== 'active') return;
        connectSocket(accessToken);
        if (chatRoom.id) {
          void waitForSocketConnection(5000)
            .then(() =>
              joinChatRoomWithAck(chatRoom.id).catch(() => {
                joinChatRoom(chatRoom.id);
                return { roomId: chatRoom.id };
              }),
            )
            .then(() => markRead(chatRoom.id))
            .catch((error: unknown) => {
              setSocketNotice(error instanceof Error ? error.message : t('Failed to reconnect chat.'));
            });
        }
      });

      return () => {
        isActive = false;
        unsubscribeCreated?.();
        unsubscribeRead?.();
        unsubscribeDisconnect?.();
        unsubscribeError?.();
        appStateSubscription?.remove();
        leaveChatRoom(chatRoom.id);
      };
    }, [accessToken, applyReadEvent, chatRoom, markRead, t]),
  );

  const canSend = useMemo(() => {
    return Boolean(
      isAccessibleChatRoom(chatRoom) &&
      chatRoom.canSendMessages !== false &&
      inputValue.trim(),
    ) && !isSending;
  }, [chatRoom, inputValue, isSending]);

  const translateIncomingMessage = useCallback(async (message: ChatMessage): Promise<void> => {
    const body = message.type === 'FILE' ? '' : message.body?.trim() ?? '';
    if (!body || message.senderRole !== 'CLIENT') {
      return;
    }

    const translationKey = `${language}:${message.id}`;
    if (translationRequestedMessageIdsRef.current.has(translationKey)) {
      return;
    }
    translationRequestedMessageIdsRef.current.add(translationKey);

    setTranslatingMessageIds((current) => ({ ...current, [message.id]: true }));

    try {
      const candidates = buildSourceLanguageCandidates(body, language);
      let translated = body;

      for (const sourceLanguage of candidates) {
        const attempt = await translateDynamicText({
          text: body,
          sourceLanguage,
          targetLanguage: language,
          context: 'driver chat message',
        });

        if (normalizeComparableText(attempt) !== normalizeComparableText(body)) {
          translated = attempt;
          break;
        }
      }

      if (activeLanguageRef.current !== language) {
        return;
      }

      setTranslatedMessages((current) => ({
        ...current,
        [message.id]: { language, text: translated },
      }));
    } finally {
      setTranslatingMessageIds((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }
  }, [language]);

  useEffect(() => {
    for (const message of messages) {
      void translateIncomingMessage(message);
    }
  }, [messages, translateIncomingMessage]);

  const currentUserId = user?.id ?? '';

  const messageRows = useMemo(() => groupChatAttachments(messages), [messages]);
  const renderMessage = ({ item, index }: { item: ChatMessageRow; index: number }) => {
    const previousRow = messageRows[index - 1];
    const previousMessage = previousRow?.attachments?.[previousRow.attachments.length - 1] ?? previousRow;
    const messageDate = new Date(item.createdAt);
    const showDate = !previousMessage || new Date(previousMessage.createdAt).toDateString() !== messageDate.toDateString();
    const startsGroup = showDate || previousMessage.senderId !== item.senderId || messageDate.getTime() - new Date(previousMessage.createdAt).getTime() > 5 * 60 * 1000;
    const isDriverMessage =
      item.senderRole === 'DRIVER' || (currentUserId ? item.senderId === currentUserId : false);
    const translatedMessage = translatedMessages[item.id];
    const translatedText = translatedMessage?.language === language ? translatedMessage.text : undefined;
    const isShowingTranslation = Boolean(
      !isDriverMessage &&
      translatedText &&
      item.body &&
      normalizeComparableText(translatedText) !== normalizeComparableText(item.body),
    );
    const isTranslating = Boolean(translatingMessageIds[item.id]);
    const isAttachment = item.type === 'FILE' && Boolean(item.attachmentUrl);
    const metadata = (
      <View style={styles.messageMetadata}>
        <Text style={[styles.messageTime, isAttachment && styles.mediaTime]}>{formatTime(item.attachments?.[item.attachments.length - 1]?.createdAt ?? item.createdAt)}</Text>

      </View>
    );
    const displayedBody = item.type === 'FILE' ? null : isShowingTranslation ? translatedText : item.body;

    return (
      <View>
        {showDate ? (
          <View style={styles.dateDivider}>
            <Text style={styles.dateText}>{messageDate.toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
          </View>
        ) : null}
        <View style={[styles.messageRow, startsGroup && styles.groupStart, isDriverMessage ? styles.messageRowRight : styles.messageRowLeft]}>
          <Pressable
            style={[styles.messageBubble, isAttachment ? styles.attachmentBubble : isDriverMessage ? styles.driverBubble : styles.clientBubble, startsGroup && !isAttachment && (isDriverMessage ? styles.driverBubbleStart : styles.clientBubbleStart)]}
            onLongPress={isDriverMessage || item.attachments ? undefined : () => openReportModal(item.id)}
            accessibilityHint={isDriverMessage ? undefined : t('Long press to report this message.')}
          >
            {startsGroup && !isAttachment ? <View style={[styles.bubbleTail, isDriverMessage ? styles.driverTail : styles.clientTail]} /> : null}
            {item.attachments ? <ChatAttachmentGroup messages={item.attachments} metadata={metadata} onReport={isDriverMessage ? undefined : id => openReportModal(id)} /> : item.type === 'FILE' && item.attachmentUrl ? <ChatAttachment url={item.attachmentUrl} name={item.body ?? 'document.pdf'} metadata={metadata} /> : null}
            {displayedBody ? (
              <Text style={[styles.messageText, isDriverMessage && styles.driverMessageText]}>{displayedBody}</Text>
            ) : null}
            {isTranslating ? (
              <Text style={[styles.translationHint, isDriverMessage && styles.driverTranslationHint]}>
                {t('Translating...')}
              </Text>
            ) : null}
            {isShowingTranslation ? (
              <View style={[styles.translationBlock, isDriverMessage && styles.driverTranslationBlock]}>
                <Text style={[styles.translationLabel, isDriverMessage && styles.driverTranslationLabel]}>
                  {t('Translated to {{language}}', {
                    language: LANGUAGE_CONFIGS[language].nativeLabel,
                  })}
                </Text>
                {item.body ? (
                  <Text style={[styles.translationText, isDriverMessage && styles.driverTranslationText]}>
                    {item.body}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!isAttachment ? metadata : null}
          </Pressable>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Stack.Screen options={{ headerShown: true }} />
        <ActivityIndicator size="large" color="#FFC515" />
        <Text style={styles.stateText}>{t('Loading chat...')}</Text>
      </SafeAreaView>
    );
  }

  if (screenError) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Stack.Screen options={{ headerShown: true }} />
        <Text style={styles.errorText}>{screenError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void resolveRoomAndMessages()}>
          <Text style={styles.retryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!chatRoom) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Stack.Screen options={{ headerShown: true }} />
        <Text style={styles.stateText}>{screenError || t('No chat room is available for this job.')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView ref={chatContainerRef} style={styles.container} onLayout={measureChatOffset}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior="padding"
        enabled={Platform.OS !== 'android' || isKeyboardVisible}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ChatWallpaper />
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.controlPressed]}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/driver-chats')}
              accessibilityRole="button"
              accessibilityLabel={t('Back')}
            >
              <DriverIcon name="arrow-back" size={22} color="#334155" />
            </Pressable>
            <View style={styles.avatar}><DriverIcon name="profile" size={25} color="#926B12" /></View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('Chat with client')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{t('Private room for this accepted job.')}</Text>
            </View>
            <Pressable style={styles.optionsButton} onPress={() => setShowChatOptions(value => !value)} accessibilityRole="button" accessibilityLabel={t('chat.options')} accessibilityState={{ expanded: showChatOptions }}>
              <ChatIcon name="more" size={24} color="#334155" />
            </Pressable>
          </View>
          {chatRoom.canSendMessages === false ? (
            <Text style={styles.blockedNotice}>
              {chatRoom.isBlockedByCurrentUser
                ? t('You blocked this client. Messaging is paused.')
                : t('Messaging is unavailable for this conversation.')}
            </Text>
          ) : null}
        </View>

          {showChatOptions ? (
            <View style={styles.optionsMenu}>
              <Pressable style={styles.optionItem} disabled={isSubmittingSafetyAction} accessibilityRole="button" onPress={() => { setShowChatOptions(false); openReportModal(); }}>
                <Text style={styles.optionText}>{t('Report client')}</Text>
              </Pressable>
              <Pressable style={styles.optionItem} disabled={isSubmittingSafetyAction} accessibilityRole="button" onPress={() => { setShowChatOptions(false); confirmBlockChange(); }}>
                <Text style={styles.optionText}>{chatRoom.isBlockedByCurrentUser ? t('Unblock client') : t('Block client')}</Text>
              </Pressable>
            </View>
          ) : null}
        {showChatOptions ? <Pressable style={styles.optionsDismiss} onPress={() => setShowChatOptions(false)} accessibilityRole="button" accessibilityLabel={t('Cancel')} /> : null}
        {socketNotice ? <Text style={styles.warningText}>{socketNotice}</Text> : null}
        <View style={styles.conversation}>
          <FlatList
            ref={listRef}
            onLayout={scrollAfterLayout}
            onContentSizeChange={scrollAfterLayout}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEnd}
            onMomentumScrollEnd={onScrollEnd}
            data={messageRows}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[styles.messagesContent, messages.length === 0 && styles.emptyMessagesContent]}
            ListHeaderComponent={
              hasMore ? (
                <Pressable
                  style={[styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled]}
                  onPress={() => void loadMoreMessages()}
                  disabled={isLoadingMore}
                >
                  <Text style={styles.loadMoreButtonText}>
                    {isLoadingMore ? t('Loading older messages...') : t('Load older messages')}
                  </Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><DriverIcon name="chat" size={32} color="#947320" /></View>
                <Text style={styles.stateText}>{t('No messages yet.')}</Text>
                <Text style={styles.emptyHint}>{t('Start the conversation when the client needs an update.')}</Text>
              </View>
            }
          />
        </View>

        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}

        <View style={styles.inputRow} onLayout={scrollAfterLayout}>
          <View style={styles.composerPill}>
            <TextInput
              style={styles.input}
              placeholder={t('Type a message')}
              placeholderTextColor="#94A3B8"
              accessibilityLabel={t('Type a message')}
              value={inputValue}
              onChangeText={setInputValue}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              editable={!isSending && chatRoom.canSendMessages !== false}
              multiline
              maxLength={1000}
            />
            <ChatAttachmentButton roomId={chatRoom.id} disabled={isSending || chatRoom.canSendMessages === false} onSent={message => setMessages(previous => mergeMessages(previous, [message]))} />
          </View>
          <Pressable
            style={({ pressed }) => [styles.sendButton, !canSend && styles.sendButtonDisabled, pressed && styles.controlPressed]}
            accessibilityRole="button"
            accessibilityLabel={isSending ? t('Sending...') : t('Send')}
            onPress={() => void sendMessage()}
            disabled={!canSend}
          >
            {isSending ? <ActivityIndicator color="#263449" /> : <ChatIcon name="send" size={23} color={canSend ? "#263449" : "#9CA3AF"} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={isReportModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsReportModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.reportSheet}>
            <ScrollView contentContainerStyle={styles.reportSheetContent}>
              <Text style={styles.reportTitle}>
                {reportMessageId ? t('Report this message') : t('Report client')}
              </Text>
              <Text style={styles.reportDescription}>
                {t('Reports are sent to the Transpo24 safety team for review. The client is not told who submitted the report.')}
              </Text>
              <Text style={styles.reportSectionLabel}>{t('What happened?')}</Text>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[
                    styles.reasonOption,
                    reportReason === reason.value && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setReportReason(reason.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: reportReason === reason.value }}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      reportReason === reason.value && styles.radioCircleSelected,
                    ]}
                  />
                  <Text style={styles.reasonText}>{t(reason.label)}</Text>
                </Pressable>
              ))}
              <TextInput
                value={reportDetails}
                onChangeText={setReportDetails}
                placeholder={
                  reportReason === 'OTHER'
                    ? t('Describe what happened (required)')
                    : t('Add details (optional)')
                }
                style={styles.reportInput}
                multiline
                maxLength={1000}
              />
              {safetyMessage ? <Text style={styles.errorText}>{safetyMessage}</Text> : null}
              <View style={styles.reportFooter}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => setIsReportModalVisible(false)}
                  disabled={isSubmittingSafetyAction}
                >
                  <Text style={styles.cancelButtonText}>{t('Cancel')}</Text>
                </Pressable>
                <Pressable
                  style={styles.reportSubmitButton}
                  onPress={() => void submitReport()}
                  disabled={isSubmittingSafetyAction}
                >
                  <Text style={styles.reportSubmitButtonText}>
                    {isSubmittingSafetyAction ? t('Submitting...') : t('Submit report')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  conversation: { flex: 1, overflow: 'hidden' },
  optionsDismiss: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  optionText: {
    fontSize: 15,
    color: '#111B21',
  },
  optionItem: {
    minHeight: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  optionsMenu: {
    position: 'absolute',
    top: 52,
    end: 8,
    width: 220,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#E0E5E2',
    zIndex: 4,
  },
  optionsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaTime: {
    color: '#FFFFFF',
  },
  messageMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  clientTail: {
    start: -6,
    borderStartWidth: 7,
    borderStartColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  driverTail: {
    end: -6,
    borderEndWidth: 7,
    borderEndColor: 'transparent',
    borderTopColor: '#FFF0BD',
  },
  bubbleTail: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 0,
  },
  clientBubbleStart: {
    borderTopStartRadius: 0,
  },
  driverBubbleStart: {
    borderTopEndRadius: 0,
  },
  groupStart: {
    marginTop: 7,
  },
  composerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    paddingEnd: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -10,
  },
  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFF0BD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#54656F',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    overflow: 'hidden',
  },
  dateLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DCE3EC',
    flex: 1,
  },
  dateDivider: {
    alignItems: 'center',
    marginVertical: 10,
  },
  controlPressed: {
    opacity: 0.72,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: '#FFFFFF',
    zIndex: 3,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#7B8798',
  },
  safetyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6EBF1',
    backgroundColor: '#FAFBFC',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  unblockButton: {
    borderColor: '#9A6500',
  },
  safetyButtonText: {
    color: '#69768A',
    fontSize: 12,
    fontWeight: '600',
  },
  blockedNotice: {
    fontSize: 12,
    color: '#92400E',
    paddingHorizontal: 8,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F7F8F9',
  },
  stateText: {
    fontSize: 16,
    color: '#505A6A',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 21,
    color: '#8B97A8',
    textAlign: 'center',
  },
  warningText: {
    marginHorizontal: 16,
    marginTop: 12,
    color: '#92400E',
    fontSize: 13,
  },
  translationBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    color: '#707A8C',
    fontSize: 13,
  },
  errorText: {
    marginHorizontal: 16,
    color: '#B91C1C',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#FFC515',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#171717',
    fontSize: 15,
    fontWeight: '700',
  },
  closedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
  },
  closedBannerText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 3,
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
  },
  messageRow: {
    width: '100%',
  },
  messageRowLeft: {
    alignItems: 'flex-start',
  },
  messageRowRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 4,
    gap: 2,
  },
  attachmentBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  clientBubble: {
    backgroundColor: '#FFFFFF',
  },
  driverBubble: {
    backgroundColor: '#FFF0BD',
  },
  messageText: {
    color: '#111B21',
    fontSize: 16,
    lineHeight: 22,
  },
  translationHint: {
    color: '#707A8C',
    fontSize: 12,
  },
  driverTranslationHint: {
    color: '#8A6200',
  },
  translationBlock: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    gap: 4,
  },
  driverTranslationBlock: {
    borderTopColor: '#F1D46B',
  },
  translationLabel: {
    color: '#505A6A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  driverTranslationLabel: {
    color: '#8A6200',
  },
  translationText: {
    color: '#202020',
    fontSize: 14,
    lineHeight: 19,
  },
  driverTranslationText: {
    color: '#171717',
  },
  driverMessageText: {
    color: '#171717',
  },
  messageTime: {
    color: '#667781',
    fontSize: 10,
  },
  driverMessageTime: {
    color: '#9B8652',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginBottom: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    backgroundColor: '#FFFFFF',
  },
  loadMoreButtonDisabled: {
    opacity: 0.7,
  },
  loadMoreButtonText: {
    color: '#505A6A',
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 124,
    paddingStart: 16,
    paddingEnd: 2,
    paddingTop: 13,
    paddingBottom: 11,
    fontSize: 16,
    lineHeight: 22,
    color: '#111B21',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#707A8C',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC93E',
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  sendButtonText: {
    color: '#171717',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  reportSheet: {
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  reportSheetContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  reportTitle: {
    color: '#202020',
    fontSize: 22,
    fontWeight: '800',
  },
  reportDescription: {
    color: '#707A8C',
    fontSize: 14,
    lineHeight: 20,
  },
  reportSectionLabel: {
    color: '#202020',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  reasonOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  reasonOptionSelected: {
    borderColor: '#9A6500',
    backgroundColor: '#FFF9E8',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#707A8C',
  },
  radioCircleSelected: {
    borderWidth: 5,
    borderColor: '#9A6500',
  },
  reasonText: {
    color: '#202020',
    fontSize: 14,
    flex: 1,
  },
  reportInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: '#DFE3E8',
    borderRadius: 10,
    padding: 12,
    color: '#202020',
    textAlignVertical: 'top',
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DFE3E8',
  },
  cancelButtonText: {
    color: '#202020',
    fontWeight: '700',
  },
  reportSubmitButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#B91C1C',
  },
  reportSubmitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
