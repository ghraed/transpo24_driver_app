
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getCurrentAccessToken as readToken } from './auth-storage';
export type PendingChatOperation = { id: string; roomId: string; kind: 'TEXT' | 'FILE'; payload: string; file?: { uri: string; name: string; mimeType?: string; size?: number; operationId?: string } };
function owner() {
  const credential = readToken?.();
  try { const id = JSON.parse(atob((credential ?? '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).sub; if (typeof id === 'string' && id) return encodeURIComponent(id); } catch { /* Fail closed instead of sharing another account's outbox. */ }
  throw new Error('Sign in before sending a message.');
}
export function chatAccountId() { return owner(); }
export function assertChatAccount(expected: string) { if (owner() !== expected) throw new Error('The signed-in account changed. Reopen the conversation.'); }
function directory() { const value = new Directory(Paths.document, 'chat-outbox', owner()); value.create({ intermediates: true, idempotent: true }); return value; }
function key() { return 'chat-outbox-' + owner(); }
function read(): PendingChatOperation[] {
  const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key()) : (() => { const dir = directory(); const file = new File(dir, 'pending.json'); const next = new File(dir, 'pending.next.json'); return file.exists ? file.textSync() : next.exists ? next.textSync() : null; })();
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(item => !item.id || !item.roomId || !['TEXT','FILE'].includes(item.kind))) throw new Error('Unable to recover pending messages.');
  return value;
}
function write(value: PendingChatOperation[]) {
  if (Platform.OS === 'web') { globalThis.localStorage.setItem(key(), JSON.stringify(value)); return; }
  const dir = directory(); const pending = new File(dir, 'pending.next.json'); pending.write(JSON.stringify(value));
  const target = new File(dir, 'pending.json'); if (target.exists) target.delete(); pending.move(target);
}
export function beginChatOperation(roomId: string, kind: 'TEXT' | 'FILE', payload: string, asset?: PendingChatOperation['file']): PendingChatOperation {
  const all = read();
  const existing = asset?.operationId ? all.find(op => op.id === asset.operationId && op.roomId === roomId && op.kind === kind) : all.find(op => op.roomId === roomId && op.kind === kind && op.payload === payload);
  if (existing) return existing;
  if (asset?.operationId) throw new Error('Refresh the conversation to reconcile this attachment.');
  const id = Date.now().toString(36) + '-' + Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
  const op: PendingChatOperation = { id, roomId, kind, payload, file: asset ? { ...asset, operationId: id } : undefined };
  if (op.file && Platform.OS !== 'web') {
    const copy = new File(directory(), id + (asset?.mimeType === 'application/pdf' ? '.pdf' : '.image'));
    new File(op.file.uri).copy(copy); op.file.uri = copy.uri;
  }
  write([...all, op]); return op;
}
export function finishChatOperation(id: string) {
  const all = read(); const op = all.find(item => item.id === id); write(all.filter(item => item.id !== id));
  if (op?.file && Platform.OS !== 'web') { try { const file = new File(op.file.uri); if (file.exists) file.delete(); } catch { /* acknowledged messages remain recoverable on the server */ } }
}
export function pendingChatOperations(roomId: string) { return read().filter(op => op.roomId === roomId); }
export function reconcileChatOperations(messages: { operationId?: string | null }[]) {
  for (const message of messages) if (message.operationId && read().some(op => op.id === message.operationId)) finishChatOperation(message.operationId);
}

// Read the uncertain operations before removing committed ones so an automatically
// restored composer cannot remain populated and resend the committed text as a new operation.
export function reconcileChatComposer(roomId: string, messages: { operationId?: string | null }[]) {
  const known = new Set(messages.map(message => message.operationId).filter(Boolean));
  const pending = pendingChatOperations(roomId);
  const confirmedPayloads = pending.filter(op => op.kind === 'TEXT' && known.has(op.id)).map(op => op.payload);
  reconcileChatOperations(messages);
  const pendingPayload = pendingChatOperations(roomId).filter(op => op.kind === 'TEXT').at(-1)?.payload;
  return (current: string) => confirmedPayloads.includes(current) ? '' : current || pendingPayload || '';
}
