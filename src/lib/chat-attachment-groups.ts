import type { ChatMessage } from '@/types/chat';

export type ChatMessageRow = ChatMessage & { attachments?: ChatMessage[] };
const isAttachment = (message: ChatMessage) => message.type === 'FILE' && Boolean(message.attachmentUrl);

// Group adjacent attachment messages using server timestamps, so live messages
// and reloaded history use the same layout without changing the message API.
export function groupChatAttachments(messages: ChatMessage[]): ChatMessageRow[] {
  const rows: ChatMessageRow[] = [];
  for (const message of messages) {
    const previous = rows[rows.length - 1];
    const last = previous?.attachments?.[previous.attachments.length - 1] ?? previous;
    const elapsed = last ? Date.parse(message.createdAt) - Date.parse(last.createdAt) : Infinity;
    if (last && isAttachment(message) && isAttachment(last) &&
      last.senderId === message.senderId && last.chatRoomId === message.chatRoomId &&
      new Date(last.createdAt).toDateString() === new Date(message.createdAt).toDateString() &&
      elapsed >= 0 && elapsed <= 120000) {
      previous.attachments = [...(previous.attachments ?? [{ ...last }]), message];
    } else {
      rows.push({ ...message });
    }
  }
  return rows;
}
