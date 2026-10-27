# Driver document photo preparation

## Reported failure

The app previously passed full-resolution camera photos (`quality: 1`) directly
into document state and upload. Its client and API both enforce 5 MiB per image.
A sufficiently large iPhone photo therefore produced the personal-selfie/ID size
error. Picker quality is not a byte-size guarantee; on iOS it is ignored for
some library formats, including PNG.

## New behavior

`src/lib/document-photo.ts` is shared by personal onboarding documents and
vehicle-document/photo selection, for both camera and library sources.

- Read actual file size rather than trusting picker metadata.
- Retain already-small supported photos without recompression.
- Decode larger/unsupported images, use decoded dimensions, and preserve the
  full frame and aspect ratio without cropping or upscaling.
- Save a JPEG copy, starting at a 2560-pixel longest edge and quality 0.85.
- If still over 5 MiB, retry at 2048/0.75, then 1600/0.65. Measure each saved
  file; reject if none is within the existing limit.
- Return the generated JPEG URI, filename, MIME type, byte size and dimensions
  before validation or upload. Keep the user's original unchanged and clean up
  rejected generated files. Release native image/context references.

Photo controls and submission are disabled during preparation. Cancellation and
processing errors restore them, and processing failures do not upload the
original. Progress and error copy is available in all six driver languages.

The backend's 5 MiB validation is unchanged. No production API deployment is
needed for this image preparation change.

## Native build requirement

This adds `expo-image-manipulator` ~56.0.26, compatible with SDK 56. Its package
and native image-processing implementation were reviewed for this local-file
use; no analytics or advertising integration was added. The existing dependency
source-check baseline was updated.

The module is not included in the existing TestFlight 1.0.2 (6) app. A new native
iOS build must be built, uploaded to TestFlight and installed before the owner
can use this complete fix. Android and development clients also need rebuilding
to gain the module. Do not publish this change under an old native runtime or
claim that an in-app update alone installs the native module.

The module loads on use. A development client without it can still load the
screen and use already-small supported images, but gets an update-required
message when high-resolution processing is needed.

## Validation

Unit tests cover high-resolution input, iOS/Android paths, real-byte-size
validation, HEIC conversion, portrait/stale metadata, bounded retries, cleanup,
decoder failures, permissions/cancellation and missing-module compatibility.
Screen tests cover camera/library uploads for selfie, ID front, ID back and
licence, plus pending/error/cancellation states.

After installing a new native build, verify real camera and library photos on
Android and iPhone, including a photo above 5 MiB, portrait photos and HEIC/PNG
selection. Confirm the uploaded selfie and ID text remain clear. Tests with
mocked native codecs do not establish physical-device image quality or decoding.

Sources: [Expo ImageManipulator v56](https://docs.expo.dev/versions/v56.0.0/sdk/imagemanipulator/),
[Expo ImagePicker v56](https://docs.expo.dev/versions/v56.0.0/sdk/imagepicker/).
