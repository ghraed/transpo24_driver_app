let mockConfigured=false;
jest.mock('react-native',()=>({Platform:{OS:'android'}}));
jest.mock('@/config/maps',()=>({get HAS_GOOGLE_MAPS_API_KEY(){return mockConfigured;}}));
jest.mock('react-native-maps',()=>({default:'Map',Marker:'Marker',Polyline:'Polyline',PROVIDER_GOOGLE:'google'}));
test('missing staging Maps configuration provides the existing unavailable-map path without initializing the SDK',()=>{
 mockConfigured=false;jest.isolateModules(()=>expect(require('./native-maps').isNativeMapRuntimeAvailable).toBe(false));
 mockConfigured=true;jest.isolateModules(()=>{const maps=require('./native-maps');expect(maps.isNativeMapRuntimeAvailable).toBe(true);expect(maps.NativeMapView).toBe('Map');});
});

// No HTTP is used here. Keep Jest teardown from activating Expo's lazy native fetch after mocks are released.
afterAll(() => { Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: jest.fn() }); });
