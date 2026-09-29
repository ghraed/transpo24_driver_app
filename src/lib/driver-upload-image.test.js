import * as ImageManipulator from 'expo-image-manipulator';
import { MAX_DRIVER_IMAGE_BYTES, prepareDriverUploadImage } from './driver-upload-image';

const mockSizes = new Map();
const mockOutputs = [];
const mockDelete = jest.fn();
const mockResize = jest.fn();
const mockSave = jest.fn(async () => mockOutputs.shift());
const mockRender = jest.fn(async () => ({ saveAsync: mockSave }));

jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri) { this.uri = uri; }
    get size() { return mockSizes.get(this.uri) ?? 0; }
    delete() { mockDelete(this.uri); }
  },
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn(() => ({ resize: mockResize, renderAsync: mockRender })) },
}));

const asset = overrides => ({
  uri: 'file:///original.jpg', fileName: 'licence.jpg', mimeType: 'image/jpeg',
  fileSize: 2 * 1024 * 1024, width: 3600, height: 2400, ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSizes.clear();
  mockOutputs.length = 0;
});

it('keeps a supported photo under the upload limit without recompressing it', async () => {
  const prepared = await prepareDriverUploadImage(asset());
  expect(prepared.fileSize).toBe(2 * 1024 * 1024);
  expect(prepared.mimeType).toBe('image/jpeg');
  expect(ImageManipulator.ImageManipulator.manipulate).not.toHaveBeenCalled();
});

it('resizes and retries an oversized photo until it is within 5 MB', async () => {
  mockSizes.set('file:///first.jpg', MAX_DRIVER_IMAGE_BYTES + 1);
  mockSizes.set('file:///second.jpg', 3 * 1024 * 1024);
  mockOutputs.push(
    { uri: 'file:///first.jpg', width: 2400, height: 1600 },
    { uri: 'file:///second.jpg', width: 2000, height: 1333 },
  );
  const prepared = await prepareDriverUploadImage(asset({ fileSize: 12 * 1024 * 1024 }));
  expect(prepared).toMatchObject({
    uri: 'file:///second.jpg', fileName: 'licence.jpg', mimeType: 'image/jpeg',
    fileSize: 3 * 1024 * 1024, width: 2000,
  });
  expect(mockResize).toHaveBeenNthCalledWith(1, { width: 2400, height: null });
  expect(mockResize).toHaveBeenNthCalledWith(2, { width: 2000, height: null });
  expect(mockDelete).toHaveBeenCalledWith('file:///first.jpg');
});

it('converts a small unsupported picker image to an accepted JPEG', async () => {
  mockSizes.set('file:///converted.jpg', 800000);
  mockOutputs.push({ uri: 'file:///converted.jpg', width: 2000, height: 1500 });
  const prepared = await prepareDriverUploadImage(asset({
    uri: 'file:///original.heic', fileName: 'id.heic', mimeType: 'image/heic',
    fileSize: 2 * 1024 * 1024, width: 2000, height: 1500,
  }));
  expect(prepared).toMatchObject({ fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: 800000 });
});

it('reports an error when every resized version still exceeds the limit', async () => {
  for (let i = 0; i < 3; i += 1) {
    const uri = `file:///attempt-${i}.jpg`;
    mockSizes.set(uri, MAX_DRIVER_IMAGE_BYTES + 1);
    mockOutputs.push({ uri, width: 1600, height: 1200 });
  }
  await expect(prepareDriverUploadImage(asset({ fileSize: 12 * 1024 * 1024 })))
    .rejects.toThrow('Image files must be 5 MB or smaller.');
  expect(mockDelete).toHaveBeenCalledTimes(3);
});
