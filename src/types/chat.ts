export type ChatRoomStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export type ChatSenderRole = 'CLIENT' | 'DRIVER';

export type ChatMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export type ChatSocketEvent =
  | 'chat.join'
  | 'chat.leave'
  | 'chat.message.send'
  | 'chat.message.created'
  | 'chat.message.read'
  | 'chat.typing';

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  type: ChatMessageType;
  body: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface ChatRoom {
  id: string;
  transportRequestId: string;
  clientId: string;
  driverId: string;
  acceptedOfferId: string;
  status: ChatRoomStatus;
  createdAt: string;
  updatedAt: string;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
}

export interface DriverChatRoomsResponse {
  rooms: ChatRoom[];
}

export interface ChatRoomMessagesResponse {
  messages: ChatMessage[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface SendChatMessagePayload {
  body: string;
}

export interface SendChatMessageResponse {
  message: ChatMessage;
}

export interface MarkChatMessagesReadResponse {
  roomId: string;
  readAt: string;
}

export interface ChatMessageCreatedEventPayload {
  roomId: string;
  message: ChatMessage;
}

export interface ChatMessageReadEventPayload {
  roomId: string;
  readAt: string;
  messageIds?: string[];
}

export interface ChatTypingEventPayload {
  roomId: string;
  userId?: string;
  role?: ChatSenderRole;
  isTyping?: boolean;
}
