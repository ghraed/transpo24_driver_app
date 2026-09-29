import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';

import type { LocalDocumentAsset } from '@/types/auth';

export const MAX_DRIVER_IMAGE_BYTES = 5 * 1024 * 1024;
export const DRIVER_IMAGE_GUIDANCE = 'JPEG, PNG, or WEBP images, up to 5 MB. Large photos are resized automatically.';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RESIZE_ATTEMPTS = [
  { longestEdge: 2400, quality: 0.88 },
  { longestEdge: 2000, quality: 0.76 },
  { longestEdge: 1600, quality: 0.62 },
] as const;

function imageSize(uri: string): number {
  return new File(uri).size;
}

export async function prepareDriverUploadImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<LocalDocumentAsset> {
  const originalSize = asset.fileSize ?? imageSize(asset.uri);
  if (SUPPORTED_IMAGE_TYPES.has(asset.mimeType ?? '') && originalSize > 0 && originalSize <= MAX_DRIVER_IMAGE_BYTES) {
    return {
      uri: asset.uri,
      fileName: asset.fileName ?? undefined,
      mimeType: asset.mimeType ?? undefined,
      fileSize: originalSize,
      width: asset.width,
      height: asset.height,
    };
  }

  for (const { longestEdge, quality } of RESIZE_ATTEMPTS) {
    const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
    const originalLongestEdge = Math.max(asset.width, asset.height);
    if (originalLongestEdge > longestEdge) {
      if (asset.width >= asset.height) {
        context.resize({ width: longestEdge, height: null });
      } else {
        context.resize({ width: null, height: longestEdge });
      }
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: quality,
    });
    const preparedFile = new File(result.uri);
    const preparedSize = preparedFile.size;
    if (preparedSize > 0 && preparedSize <= MAX_DRIVER_IMAGE_BYTES) {
      return {
        uri: result.uri,
        fileName: `${(asset.fileName ?? 'driver-photo').replace(/\.[^.]+$/, '')}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: preparedSize,
        width: result.width,
        height: result.height,
      };
    }
    preparedFile.delete();
  }

  throw new Error('Image files must be 5 MB or smaller.');
}
