import { jest, test, expect, beforeEach } from '@jest/globals';
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
let mockOwner = 'customer-1';
const mockStorage = new Map<string, string>();
jest.mock('./auth-storage', () => ({ getCurrentAccessToken: () => btoa(JSON.stringify({ sub: mockOwner })) + '.synthetic' }));
beforeEach(() => {
  jest.resetModules(); mockStorage.clear(); mockOwner = 'customer-1';

  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value: {
    getItem: (key:string) => mockStorage.get(key) ?? null,
    setItem: (key:string,value:string) => mockStorage.set(key,value),
  } });
});
function load() { return jest.requireActual('./chat-outbox') as typeof import('./chat-outbox'); }
test('a lost acknowledgment reuses the same operation across reload and HTTP/socket transports', () => {
  const first = load().beginChatOperation('room','TEXT','Hello');
  expect(load().beginChatOperation('room','TEXT','Hello').id).toBe(first.id);
  jest.resetModules();
  expect(load().beginChatOperation('room','TEXT','Hello').id).toBe(first.id);
  load().finishChatOperation(first.id);
  expect(load().beginChatOperation('room','TEXT','Hello').id).not.toBe(first.id);
});
test('account and conversation scopes remain isolated', () => {
  const first = load().beginChatOperation('room','TEXT','Hello');
  expect(load().beginChatOperation('other-room','TEXT','Hello').id).not.toBe(first.id);
  mockOwner = 'customer-2';
  expect(load().pendingChatOperations('room')).toEqual([]);
});
test('fetched history reconciles a committed operation after restart', () => {
  const first = load().beginChatOperation('room','TEXT','Hello');
  load().reconcileChatOperations([{ operationId:first.id }]);
  expect(load().pendingChatOperations('room')).toEqual([]);
});

test('an in-flight batch guard rejects account replacement before a retry can use the new account',()=>{
 const original=load().chatAccountId();mockOwner='different-owner';
 expect(()=>load().assertChatAccount(original)).toThrow('account changed');
});
