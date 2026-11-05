import { beforeEach, expect, jest, test } from '@jest/globals';
const mockFiles = new Map<string,string>();
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('./auth-storage',()=>({getCurrentAccessToken:()=>btoa(JSON.stringify({sub:'native-fixture'}))+'.signed'}));
jest.mock('expo-file-system',()=>({
 Paths:{document:'file:///documents'},
 Directory:class { uri: string; constructor(...parts:any[]){this.uri=parts.map(p=>typeof p==='string'?p:p.uri).join('/');} create(){} },
 File:class { uri: string; constructor(...parts:any[]){this.uri=parts.map(p=>typeof p==='string'?p:p.uri).join('/');}get exists(){return mockFiles.has(this.uri);}textSync(){return mockFiles.get(this.uri);}write(value:string){mockFiles.set(this.uri,value);}delete(){mockFiles.delete(this.uri);}copy(target:{uri:string}){if(!mockFiles.has(this.uri))throw Error('missing source');mockFiles.set(target.uri,mockFiles.get(this.uri)!);}move(target:{uri:string}){mockFiles.set(target.uri,mockFiles.get(this.uri)!);mockFiles.delete(this.uri);this.uri=target.uri;} },
}));
beforeEach(()=>{mockFiles.clear();jest.resetModules();});
function load(){return jest.requireActual('./chat-outbox') as typeof import('./chat-outbox');}
test('a failed attachment survives cache loss and module restart, reuses its operation, and is removed only after acknowledgment',()=>{
 mockFiles.set('file:///picker-cache/card.pdf','synthetic-bytes');
 const first=load().beginChatOperation('room-native','FILE','file:///picker-cache/card.pdf',{uri:'file:///picker-cache/card.pdf',name:'card.pdf',mimeType:'application/pdf'});
 expect(first.file?.uri).toContain('file:///documents/chat-outbox/');
 mockFiles.delete('file:///picker-cache/card.pdf');jest.resetModules();
 const restored=load().pendingChatOperations('room-native')[0];
 const retry=load().beginChatOperation('room-native','FILE',restored.file!.uri,restored.file);
 expect(retry.id).toBe(first.id);expect(mockFiles.get(retry.file!.uri)).toBe('synthetic-bytes');
 load().finishChatOperation(retry.id);expect(mockFiles.has(retry.file!.uri)).toBe(false);
 expect(load().pendingChatOperations('room-native')).toEqual([]);
});

test('recovers the fully written replacement if the process dies between journal replacement steps',()=>{
 mockFiles.set('file:///picker-cache/card.pdf','synthetic-bytes');
 const op=load().beginChatOperation('room-native','FILE','file:///picker-cache/card.pdf',{uri:'file:///picker-cache/card.pdf',name:'card.pdf'});
 const journal=[...mockFiles.keys()].find(path=>path.endsWith('/pending.json'))!;
 mockFiles.set(journal.replace('pending.json','pending.next.json'),mockFiles.get(journal)!);mockFiles.delete(journal);
 jest.resetModules();expect(load().pendingChatOperations('room-native')[0].id).toBe(op.id);
});

test('a restored draft is cleared when delayed history confirms its uncertain operation, while an edited draft survives',()=>{
 const operation=load().beginChatOperation('room-native','TEXT','Synthetic restart message');
 jest.resetModules();
 const restore=load().reconcileChatComposer('room-native',[]);
 expect(restore('')).toBe(operation.payload);
 const recover=load().reconcileChatComposer('room-native',[{operationId:operation.id}]);
 expect(recover(operation.payload)).toBe('');
 expect(recover('A separately edited draft')).toBe('A separately edited draft');
 expect(load().pendingChatOperations('room-native')).toEqual([]);
});
