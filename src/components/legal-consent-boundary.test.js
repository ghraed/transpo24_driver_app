import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LegalConsentBoundary } from './legal-consent-boundary';
let mockToken='account-a';
let mockOwnerId='account-a';
const mockLogout=jest.fn(async()=>{});
jest.mock('@/context/auth-context',()=>({useAuth:()=>({accessToken:mockToken,signOut:mockLogout,user:{id:mockOwnerId}})}));
jest.mock('@/config/backend',()=>({getBackendApiBaseUrl:()=> 'http://synthetic.test'}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
jest.mock('expo-splash-screen',()=>({hideAsync:async()=>{}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
jest.mock('@/theme/driver-theme',()=>({useDriverColors:()=>({primary:'#8CDD00'})}));
let tree;
const realFetch=global.fetch;
const response=(body,status=200)=>({ok:status<400,json:async()=>body});
const policy={version:'2026-08-25',text:'Synthetic terms',accepted:false};
const find=role=>tree.root.findAll(n=>typeof n.props.onPress==='function').find(n=>n.props.accessibilityRole===role);
const business=()=>tree.root.findAllByType(Text).some(n=>n.props.children==='business');
beforeEach(()=>{mockToken='account-a';mockOwnerId='account-a';jest.clearAllMocks();global.fetch=jest.fn(async()=>response(policy));});
afterEach(async()=>{await act(async()=>tree?.unmount());global.fetch=realFetch;});
test('existing account without evidence is withheld until explicit checkbox and user-bound POST',async()=>{
 await act(async()=>{tree=create(<LegalConsentBoundary><Text>business</Text></LegalConsentBoundary>);});
 expect(business()).toBe(false);
 const button=()=>tree.root.findAll(n=>typeof n.props.onPress==='function').find(n=>n.props.disabled!==undefined);
 expect(button().props.disabled).toBe(true);
 await act(async()=>find('checkbox').props.onPress());
 await act(async()=>button().props.onPress());
 expect(global.fetch).toHaveBeenLastCalledWith('http://synthetic.test/auth/legal',expect.objectContaining({method:'POST',headers:expect.objectContaining({Authorization:'Bearer account-a'}),body:JSON.stringify({version:policy.version})}));
 expect(business()).toBe(true);
});
test('failed acceptance does not admit the account',async()=>{
 await act(async()=>{tree=create(<LegalConsentBoundary><Text>business</Text></LegalConsentBoundary>);});
 await act(async()=>find('checkbox').props.onPress());
 global.fetch.mockResolvedValueOnce(response({},409));
 await act(async()=>tree.root.findAll(n=>typeof n.props.onPress==='function').find(n=>n.props.disabled===false).props.onPress());
 expect(business()).toBe(false);
 expect(tree.root.findAllByType(Text).some(n=>n.props.accessibilityRole==='alert')).toBe(true);
});
test('account switch discards a delayed policy response from the previous account',async()=>{
 let finish;
 global.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{tree=create(<LegalConsentBoundary><Text>business</Text></LegalConsentBoundary>);});
 mockToken='account-b'; mockOwnerId='account-b';
 await act(async()=>tree.update(<LegalConsentBoundary><Text>business</Text></LegalConsentBoundary>));
 await act(async()=>finish(response({...policy,accepted:true})));
 expect(business()).toBe(false);
 expect(global.fetch).toHaveBeenLastCalledWith('http://synthetic.test/auth/legal',expect.objectContaining({headers:{Authorization:'Bearer account-b'}}));
});

test('rotating a token for the same account does not remount an in-flight business screen',async()=>{
 let mounts=0;
 function Business(){React.useEffect(()=>{mounts++;},[]);return <Text>business</Text>;}
 global.fetch.mockResolvedValue(response({...policy,accepted:true}));
 await act(async()=>{tree=create(<LegalConsentBoundary><Business/></LegalConsentBoundary>);});
 expect(mounts).toBe(1);mockToken='account-a-rotated';
 await act(async()=>tree.update(<LegalConsentBoundary><Business/></LegalConsentBoundary>));
 expect(business()).toBe(true);expect(mounts).toBe(1);
});
