import { expect, it } from '@jest/globals';
import { groupChatAttachments } from './chat-attachment-groups';
import type { ChatMessage } from '@/types/chat';
const file = (id: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id, chatRoomId: 'room', senderId: 'driver', senderRole: 'DRIVER', type: 'FILE', body: `${id}.jpg`,
  attachmentUrl: `/request-files/${id}/content`, createdAt: '2026-09-10T10:00:00Z', readAt: null, ...overrides,
});
it('groups consecutive uploads using persisted message data without modifying it', () => {
  const messages = [file('a'), file('b'), file('c')];
  expect(groupChatAttachments(messages)[0].attachments).toEqual(messages);
  expect(messages[0]).not.toHaveProperty('attachments');
  expect(groupChatAttachments(JSON.parse(JSON.stringify(messages)))).toEqual(groupChatAttachments(messages));
});
it.each([
  { senderId: 'client' }, { chatRoomId: 'other' }, { type: 'TEXT' as const, attachmentUrl: null },
  { createdAt: '2026-09-10T10:05:00Z' }, { createdAt: '2026-09-11T10:00:00Z' },
])('does not group across a conversation boundary: %j', overrides => {
  expect(groupChatAttachments([file('a'), file('b', overrides)])).toHaveLength(2);
});
it('keeps a text message between attachments in its original position', () => {
  expect(groupChatAttachments([file('a'), file('text', { type: 'TEXT', attachmentUrl: null }), file('b')]).map(row => row.id)).toEqual(['a', 'text', 'b']);
});
