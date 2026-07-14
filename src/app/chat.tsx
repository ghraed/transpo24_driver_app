import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';
import {
  getDriverChatMessages,
  getDriverChatRoom,
  getDriverChatRoomByTransportRequestId,
  markDriverChatRoomMessagesRead,
  sendDriverChatMessage,
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
import type { ChatMessage, ChatMessageReadEventPayload, ChatRoom } from '@/types/chat';

const FIRST_PAGE = 1;
const PAGE_SIZE = 30;

type ChatScreenParams = {
  chatRoomId?: string;
  transportRequestId?: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
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

function buildSourceLanguageCandidates(text: string, targetLanguage: AppLanguage): AppLanguage[] {
  const prioritized: AppLanguage[] = [];

  if (containsArabicCharacters(text)) {
    prioritized.push('ar');
  } else {
    if (containsSpanishMarkers(text)) prioritized.push('es');
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
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  const [translatingMessageIds, setTranslatingMessageIds] = useState<Record<string, boolean>>({});
  const lastReadAtRef = useRef<string | null>(null);
  const chatRoomRef = useRef<ChatRoom | null>(chatRoom);

  React.useEffect(() => {
    chatRoomRef.current = chatRoom;
  }, [chatRoom]);

  useEffect(() => {
    setTranslatedMessages({});
    setExpandedTranslations({});
    setTranslatingMessageIds({});
  }, [language]);

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
      if (isUnauthorizedTokenError(message) && !isChatAccessError(message)) {
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
      if (!isChatAccessError(message)) {
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

    if (!isAccessibleChatRoom(chatRoom)) {
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
    return Boolean(isAccessibleChatRoom(chatRoom) && inputValue.trim()) && !isSending;
  }, [chatRoom, inputValue, isSending]);

  const translateMessage = useCallback(async (message: ChatMessage): Promise<void> => {
    const body = message.body?.trim() ?? '';
    if (!body) {
      return;
    }

    const existingTranslation = translatedMessages[message.id];
    if (existingTranslation) {
      setExpandedTranslations((current) => ({
        ...current,
        [message.id]: !current[message.id],
      }));
      return;
    }

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

      setTranslatedMessages((current) => ({ ...current, [message.id]: translated }));
      setExpandedTranslations((current) => ({
        ...current,
        [message.id]: normalizeComparableText(translated) !== normalizeComparableText(body),
      }));
    } finally {
      setTranslatingMessageIds((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
    }
  }, [language, translatedMessages]);

  const currentUserId = user?.id ?? '';

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isDriverMessage =
      item.senderRole === 'DRIVER' || (currentUserId ? item.senderId === currentUserId : false);
    const translatedText = translatedMessages[item.id];
    const isShowingTranslation = Boolean(expandedTranslations[item.id] && translatedText);
    const isTranslating = Boolean(translatingMessageIds[item.id]);
    const displayedBody = isShowingTranslation ? translatedText : item.body;

    return (
      <View style={[styles.messageRow, isDriverMessage ? styles.messageRowRight : styles.messageRowLeft]}>
        <Pressable
          style={[styles.messageBubble, isDriverMessage ? styles.driverBubble : styles.clientBubble]}
          onPress={() => void translateMessage(item)}
          disabled={!item.body || isTranslating}
        >
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
          <Text style={[styles.messageTime, isDriverMessage && styles.driverMessageTime]}>
            {formatTime(item.createdAt)}
          </Text>
        </Pressable>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>{t('Loading chat...')}</Text>
      </SafeAreaView>
    );
  }

  if (screenError) {
    return (
      <SafeAreaView style={styles.centeredState}>
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
        <Text style={styles.stateText}>{screenError || t('No chat room is available for this job.')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('Chat with client')}</Text>
          <Text style={styles.subtitle}>{t('Private room for this accepted job.')}</Text>
        </View>

        {socketNotice ? <Text style={styles.warningText}>{socketNotice}</Text> : null}
        <Text style={styles.translationBanner}>
          {t('Tap a message to translate it into {{language}}.', {
            language: LANGUAGE_CONFIGS[language].nativeLabel,
          })}
        </Text>

        <FlatList
          data={messages}
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
              <Text style={styles.stateText}>{t('No messages yet.')}</Text>
              <Text style={styles.emptyHint}>{t('Start the conversation when the client needs an update.')}</Text>
            </View>
          }
        />

        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={t('Type a message')}
            value={inputValue}
            onChangeText={setInputValue}
            editable={!isSending}
            multiline
            maxLength={1000}
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={() => void sendMessage()}
            disabled={!canSend}
          >
            <Text style={styles.sendButtonText}>{isSending ? t('Sending...') : t('Send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: '#F8FAFC',
  },
  stateText: {
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: '#64748B',
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
    color: '#475569',
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
    backgroundColor: '#2563EB',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
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
    paddingVertical: 16,
    gap: 10,
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
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
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  clientBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  driverBubble: {
    backgroundColor: '#0F766E',
  },
  messageText: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 20,
  },
  translationHint: {
    color: '#475569',
    fontSize: 12,
  },
  driverTranslationHint: {
    color: '#CCFBF1',
  },
  translationBlock: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    gap: 4,
  },
  driverTranslationBlock: {
    borderTopColor: 'rgba(204,251,241,0.45)',
  },
  translationLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  driverTranslationLabel: {
    color: '#CCFBF1',
  },
  translationText: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 19,
  },
  driverTranslationText: {
    color: '#FFFFFF',
  },
  driverMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    color: '#64748B',
    fontSize: 11,
  },
  driverMessageTime: {
    color: '#CCFBF1',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginBottom: 12,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#E2E8F0',
  },
  loadMoreButtonDisabled: {
    opacity: 0.7,
  },
  loadMoreButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F766E',
  },
  sendButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
