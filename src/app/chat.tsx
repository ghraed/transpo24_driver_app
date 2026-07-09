import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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

export default function ChatScreen() {
  const router = useRouter();
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
  const lastReadAtRef = useRef<string | null>(null);
  const chatRoomRef = useRef<ChatRoom | null>(chatRoom);

  React.useEffect(() => {
    chatRoomRef.current = chatRoom;
  }, [chatRoom]);

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
          throw new Error('Missing chat room id or transport request id.');
        }
      }

      const response = await getDriverChatMessages(resolvedRoom.id, FIRST_PAGE, PAGE_SIZE);
      setChatRoom(response.room ?? resolvedRoom);
      setMessages(mergeMessages([], response.messages ?? []));
      setPage(response.page ?? FIRST_PAGE);
      setHasMore(Boolean(response.hasMore));
      setSendError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load chat.';
      if (isUnauthorizedTokenError(message) && !isChatAccessError(message)) {
        await signOut();
        router.replace('/');
        return;
      }
      setScreenError(message);
    } finally {
      setIsLoading(false);
    }
  }, [initialChatRoomId, router, signOut, transportRequestId]);

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
      const message = error instanceof Error ? error.message : 'Failed to mark messages as read.';
      if (!isChatAccessError(message)) {
        setSocketNotice(message);
      }
    }
  }, []);

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
      setScreenError(error instanceof Error ? error.message : 'Failed to load older messages.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [chatRoom, hasMore, isLoadingMore, page]);

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
      setSendError('Enter a message before sending.');
      return;
    }

    if (!chatRoom) {
      setSendError('Chat room is not available yet.');
      return;
    }

    if (chatRoom.status !== 'ACTIVE') {
      setSendError('This chat is closed. You can still view previous messages.');
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
      setSendError(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  }, [chatRoom, inputValue]);

  useFocusEffect(
    useCallback(() => {
      void resolveRoomAndMessages();
    }, [resolveRoomAndMessages]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!accessToken || !chatRoom?.id) {
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
            setSocketNotice('Socket disconnected. Reconnecting...');
          });

          unsubscribeError = onSocketError((message) => {
            setSocketNotice(message || 'Socket connection error.');
          });

          setSocketNotice('');
          void markRead(chatRoom.id);
        } catch (error) {
          if (!isActive) return;
          setSocketNotice(error instanceof Error ? error.message : 'Socket connection failed.');
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
              setSocketNotice(error instanceof Error ? error.message : 'Failed to reconnect chat.');
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
    }, [accessToken, applyReadEvent, chatRoom?.id, markRead]),
  );

  const canSend = useMemo(() => {
    return Boolean(chatRoom && chatRoom.status === 'ACTIVE' && inputValue.trim()) && !isSending;
  }, [chatRoom, inputValue, isSending]);

  const currentUserId = user?.id ?? '';

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isDriverMessage =
      item.senderRole === 'DRIVER' || (currentUserId ? item.senderId === currentUserId : false);

    return (
      <View style={[styles.messageRow, isDriverMessage ? styles.messageRowRight : styles.messageRowLeft]}>
        <View style={[styles.messageBubble, isDriverMessage ? styles.driverBubble : styles.clientBubble]}>
          {item.body ? <Text style={[styles.messageText, isDriverMessage && styles.driverMessageText]}>{item.body}</Text> : null}
          <Text style={[styles.messageTime, isDriverMessage && styles.driverMessageTime]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Loading chat...</Text>
      </SafeAreaView>
    );
  }

  if (screenError) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Text style={styles.errorText}>{screenError}</Text>
        <Pressable style={styles.retryButton} onPress={() => void resolveRoomAndMessages()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!chatRoom) {
    return (
      <SafeAreaView style={styles.centeredState}>
        <Text style={styles.stateText}>No chat room is available for this job yet.</Text>
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
          <Text style={styles.title}>Chat with client</Text>
          <Text style={styles.subtitle}>
            {chatRoom.status === 'ACTIVE' ? 'Private room for this accepted job.' : 'Chat is closed.'}
          </Text>
        </View>

        {socketNotice ? <Text style={styles.warningText}>{socketNotice}</Text> : null}
        {chatRoom.status !== 'ACTIVE' ? (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerText}>This chat is closed. Previous messages remain visible.</Text>
          </View>
        ) : null}

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
                  {isLoadingMore ? 'Loading older messages...' : 'Load older messages'}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.stateText}>No messages yet.</Text>
              <Text style={styles.emptyHint}>Start the conversation when the client needs an update.</Text>
            </View>
          }
        />

        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, chatRoom.status !== 'ACTIVE' && styles.inputDisabled]}
            placeholder={chatRoom.status === 'ACTIVE' ? 'Type a message' : 'Chat closed'}
            value={inputValue}
            onChangeText={setInputValue}
            editable={chatRoom.status === 'ACTIVE' && !isSending}
            multiline
            maxLength={1000}
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={() => void sendMessage()}
            disabled={!canSend}
          >
            <Text style={styles.sendButtonText}>{isSending ? 'Sending...' : 'Send'}</Text>
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
