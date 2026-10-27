import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { LocalDocumentAsset } from '@/types/auth';

export const MAX_DOCUMENT_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ENCODING_ATTEMPTS = [
  { edge: 2560, quality: 0.85 },
  { edge: 2048, quality: 0.75 },
  { edge: 1600, quality: 0.65 },
] as const;

export class DocumentPhotoError extends Error {}

export async function pickDocumentPhoto(source: 'camera' | 'library'): Promise<LocalDocumentAsset | null> {
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new DocumentPhotoError(source === 'camera'
    ? 'Camera permission is required to take images.'
    : 'Media library permission is required to select images.');
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false,
      quality: 1, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return prepareDocumentPhoto({ uri: asset.uri, fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType ?? undefined, fileSize: asset.fileSize,
    width: asset.width, height: asset.height });
}

async function byteSize(uri: string): Promise<number> {
  const size = Platform.OS === 'web'
    ? (await (await fetch(uri)).blob()).size
    : new File(uri).size;
  if (!Number.isFinite(size) || size <= 0) throw new Error('Unreadable photo');
  return size;
}

function removeGeneratedPhoto(uri: string, originalUri: string) {
  if (uri === originalUri || Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must not hide the preparation result.
  }
}

/** Prepare the local copy before it enters form validation or multipart upload. */
export async function prepareDocumentPhoto(asset: LocalDocumentAsset): Promise<LocalDocumentAsset> {
  let currentUri: string | undefined;
  try {
    const originalSize = await byteSize(asset.uri);
    const width = Number.isFinite(asset.width) ? asset.width ?? 0 : 0;
    const height = Number.isFinite(asset.height) ? asset.height ?? 0 : 0;
    if (ACCEPTED_TYPES.has(asset.mimeType ?? '') && originalSize <= MAX_DOCUMENT_PHOTO_BYTES &&
        width > 0 && height > 0 && Math.max(width, height) <= ENCODING_ATTEMPTS[0].edge) {
      return { ...asset, fileSize: originalSize };
    }

    // Load on use so a development client built before the native dependency
    // was added can still launch and upload already-small supported photos.
    let imageManipulator: typeof import('expo-image-manipulator');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      imageManipulator = require('expo-image-manipulator');
    } catch {
      throw new DocumentPhotoError('Update the app to upload high-resolution photos.');
    }
    const context = imageManipulator.ImageManipulator.manipulate(asset.uri);
    try {
      // Use decoded dimensions rather than potentially stale picker metadata,
      // including the native decoder's handling of photo orientation.
      const original = await context.renderAsync();
      let sourceWidth: number;
      let sourceHeight: number;
      try { sourceWidth = original.width; sourceHeight = original.height; }
      finally { original.release(); }
      if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('Invalid photo dimensions');

      for (const attempt of ENCODING_ATTEMPTS) {
        context.reset();
        const scale = Math.min(1, attempt.edge / Math.max(sourceWidth, sourceHeight));
        if (scale < 1) context.resize({
          width: Math.max(1, Math.round(sourceWidth * scale)),
          height: Math.max(1, Math.round(sourceHeight * scale)),
        });
        const image = await context.renderAsync();
        let result;
        try { result = await image.saveAsync({ format: imageManipulator.SaveFormat.JPEG, compress: attempt.quality }); }
        finally { image.release(); }
        currentUri = result.uri;
        const size = await byteSize(result.uri);
        if (size <= MAX_DOCUMENT_PHOTO_BYTES) {
          const name = asset.fileName?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'document-photo';
          return { uri: result.uri, fileName: `${name}.jpg`, mimeType: 'image/jpeg',
            fileSize: size, width: result.width, height: result.height };
        }
        removeGeneratedPhoto(result.uri, asset.uri);
        currentUri = undefined;
      }
    } finally { context.release(); }
    throw new DocumentPhotoError('This photo is still too large. Please choose another image.');
  } catch (error) {
    if (currentUri) removeGeneratedPhoto(currentUri, asset.uri);
    if (error instanceof DocumentPhotoError) throw error;
    throw new DocumentPhotoError('Unable to prepare this photo. Please try another image.');
  }
}
