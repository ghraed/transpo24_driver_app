import { prepareDocumentPhoto } from './document-photo';
jest.mock('expo-image-manipulator', () => { throw new Error('Cannot find native module ExpoImageManipulator'); });
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ size: 9000000 })) }));
jest.mock('expo-image-picker', () => ({}));
test('an older binary can load the screen and requests an app update only when image processing is needed', async () => {
  await expect(prepareDocumentPhoto({ uri: 'file:///large.jpg', width: 4032, height: 3024, mimeType: 'image/jpeg' }))
    .rejects.toThrow('Update the app to upload high-resolution photos.');
});
