import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { prepareDocumentPhoto, pickDocumentPhoto, MAX_DOCUMENT_PHOTO_BYTES } from './document-photo';

const mockSizes = new Map();
const mockDelete = jest.fn();
const mockSave = jest.fn();
const mockImageRelease = jest.fn();
const mockOriginalImage = { width: 8064, height: 6048, release: jest.fn() };
const mockImage = { width: 4032, height: 3024, saveAsync: mockSave, release: mockImageRelease };
const mockContext = { reset: jest.fn(), resize: jest.fn(), renderAsync: jest.fn(), release: jest.fn() };
const mockManipulate = jest.fn();
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(uri => ({
  get size() { return mockSizes.get(uri) ?? 0; }, exists: true, delete: () => mockDelete(uri),
})) }));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args) => mockManipulate(...args) }, SaveFormat: { JPEG: 'jpeg' },
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
const source = { uri: 'file:///original.HEIC', fileName: 'IMG_1234.HEIC', mimeType: 'image/heic', width: 8064, height: 6048, fileSize: 50 };
const prepared = { uri: 'file:///prepared.jpg', width: 2560, height: 1920 };
const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks(); mockSave.mockReset();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  mockSizes.clear(); mockSizes.set(source.uri, 18 * 1024 * 1024); mockSizes.set(prepared.uri, 1024 * 1024);
  mockManipulate.mockReturnValue(mockContext);
  mockOriginalImage.width = 8064; mockOriginalImage.height = 6048;
  mockContext.renderAsync.mockReset().mockResolvedValue(mockImage).mockResolvedValueOnce(mockOriginalImage);
  mockSave.mockResolvedValue(prepared);
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
});
afterEach(() => Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }));

test.each(['ios', 'android'])('%s prepares a 48 MP photo before enforcing the upload size', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  await expect(prepareDocumentPhoto(source)).resolves.toEqual({ ...prepared, fileName: 'IMG_1234.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 });
  expect(mockContext.resize).toHaveBeenCalledWith({ width: 2560, height: 1920 });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
  expect(mockContext.release).toHaveBeenCalledTimes(1); expect(mockImageRelease).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
});

test('uses actual file bytes, retaining a small supported original without recompression', async () => {
  mockSizes.set(source.uri, 128000);
  const small = { ...source, width: 1200, height: 1600, mimeType: 'image/jpeg', fileSize: 9000000 };
  await expect(prepareDocumentPhoto(small)).resolves.toEqual({ ...small, fileSize: 128000 });
  expect(mockManipulate).not.toHaveBeenCalled();
});

test('preserves decoded portrait aspect ratio despite stale picker dimensions', async () => {
  mockOriginalImage.width = 6048; mockOriginalImage.height = 8064;
  await prepareDocumentPhoto({ ...source, width: 6048, height: 8064 });
  expect(mockContext.resize).toHaveBeenCalledWith({ width: 1920, height: 2560 });
});

test('converts unsupported formats even when they are small, without upscaling', async () => {
  mockSizes.set(source.uri, 100000);
  mockOriginalImage.width = 800; mockOriginalImage.height = 600;
  await expect(prepareDocumentPhoto({ ...source, width: 800, height: 600 })).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  expect(mockContext.resize).not.toHaveBeenCalled();
});

test('reduces dimensions and quality again when the actual encoded output exceeds 5 MB', async () => {
  mockSizes.set(prepared.uri, MAX_DOCUMENT_PHOTO_BYTES + 1); mockSizes.set('file:///second.jpg', 4000000);
  mockSave.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ uri: 'file:///second.jpg', width: 2048, height: 1536 });
  await expect(prepareDocumentPhoto(source)).resolves.toMatchObject({ uri: 'file:///second.jpg', fileSize: 4000000 });
  expect(mockContext.resize).toHaveBeenNthCalledWith(2, { width: 2048, height: 1536 });
  expect(mockSave).toHaveBeenNthCalledWith(2, { format: 'jpeg', compress: 0.75 });
  expect(mockDelete).toHaveBeenCalledWith(prepared.uri); expect(mockDelete).not.toHaveBeenCalledWith(source.uri);
});

test('bounds retries and deletes rejected generated files without touching the original', async () => {
  mockSizes.set(prepared.uri, MAX_DOCUMENT_PHOTO_BYTES + 1);
  await expect(prepareDocumentPhoto(source)).rejects.toThrow('This photo is still too large');
  expect(mockSave).toHaveBeenCalledTimes(3); expect(mockDelete).toHaveBeenCalledTimes(3);
  expect(mockDelete).not.toHaveBeenCalledWith(source.uri); expect(mockContext.release).toHaveBeenCalledTimes(1);
});

test('reports unreadable originals without using stale size metadata', async () => {
  mockSizes.set(source.uri, 0);
  await expect(prepareDocumentPhoto(source)).rejects.toThrow('Unable to prepare this photo');
  expect(mockManipulate).not.toHaveBeenCalled();
});

test('releases the native context after a decoder failure', async () => {
  mockContext.renderAsync.mockReset().mockRejectedValueOnce(new Error('Cannot decode image'));
  await expect(prepareDocumentPhoto(source)).rejects.toThrow('Unable to prepare this photo');
  expect(mockContext.release).toHaveBeenCalledTimes(1);
});

test('camera selection prepares the photo before returning it', async () => {
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [source] });
  await expect(pickDocumentPhoto('camera')).resolves.toMatchObject({ uri: prepared.uri, mimeType: 'image/jpeg', fileSize: 1024 * 1024 });
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false }));
});

test('library selection requests a compatible representation and handles cancellation', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
  await expect(pickDocumentPhoto('library')).resolves.toBeNull();
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ preferredAssetRepresentationMode: 'compatible' }));
  expect(mockManipulate).not.toHaveBeenCalled();
});

test('permission denial does not open the picker', async () => {
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
  await expect(pickDocumentPhoto('camera')).rejects.toThrow('Camera permission is required');
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
});
