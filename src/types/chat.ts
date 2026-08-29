export type ChatRoomStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

export type ChatSenderRole = 'CLIENT' | 'DRIVER';

export type ChatMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export type ChatReportReason =
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'SEXUAL_CONTENT'
  | 'THREATS_OR_VIOLENCE'
  | 'SPAM_OR_SCAM'
  | 'PERSONAL_INFORMATION'
  | 'OTHER';

export type ChatReportStatus = 'PENDING' | 'REVIEWED' | 'ACTIONED' | 'DISMISSED';

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
  isBlockedByCurrentUser?: boolean;
  isBlockedByOtherUser?: boolean;
  canSendMessages?: boolean;
}

export interface DriverChatRoomsResponse {
  rooms: ChatRoom[];
}

export interface ChatRoomMessagesResponse {
  room?: ChatRoom;
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

export interface CreateChatReportPayload {
  messageId?: string;
  reason: ChatReportReason;
  details?: string;
}

export interface ChatReport {
  id: string;
  roomId: string;
  messageId: string | null;
  reason: ChatReportReason;
  status: ChatReportStatus;
  createdAt: string;
}

export interface ChatBlockState {
  roomId: string;
  isBlockedByCurrentUser: boolean;
  isBlockedByOtherUser: boolean;
  canSendMessages: boolean;
}

export interface MarkChatMessagesReadResponse {
  roomId: string;
  readAt: string;
}

export interface ChatMessageCreatedEventPayload {
  roomId?: string;
  message?: ChatMessage;
  chatRoomId?: string;
  senderId?: string;
  senderRole?: ChatSenderRole;
  type?: ChatMessageType;
  body?: string | null;
  attachmentUrl?: string | null;
  createdAt?: string;
  readAt?: string | null;
  id?: string;
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
