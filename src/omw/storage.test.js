import { readOmwTrip, writeOmwTrip } from './storage';
const mockFiles = new Map();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'private-documents' },
  File: class {
    constructor(_, key) { this.key = key; }
    get exists() { return mockFiles.has(this.key); }
    create() { mockFiles.set(this.key, ''); }
    write(value) { mockFiles.set(this.key, value); }
    async text() { return mockFiles.get(this.key); }
    delete() { mockFiles.delete(this.key); }
  },
}));
const from = { latitude: 33, longitude: 35, address: 'From' };
const to = { latitude: 34, longitude: 36, address: 'To' };
const route = { id: 'road', coordinates: [from, to] };
const trip = { from, to, via: null, route, routes: [route], radiusKm: 5 };
beforeEach(() => mockFiles.clear());
test('round trips a route, isolates accounts, and deletes cancelled trips', async () => {
  await writeOmwTrip('one', trip);
  expect(await readOmwTrip('one')).toEqual(trip);
  expect(await readOmwTrip('two')).toBeNull();
  await writeOmwTrip('one', null);
  expect(await readOmwTrip('one')).toBeNull();
});
test('rejects damaged or invalid saved coordinates', async () => {
  mockFiles.set('omw-trip-one.json', '{broken');
  expect(await readOmwTrip('one')).toBeNull();
  mockFiles.set('omw-trip-one.json', JSON.stringify({ ...trip, to: { ...to, latitude: 1000 } }));
  expect(await readOmwTrip('one')).toBeNull();
});
