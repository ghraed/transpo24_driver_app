# Driver iOS release

The production iOS app uses `com.transpo24.driver`, Apple team `GQ79L2HQU5`
(Autobasilea GmbH), and the EAS project `@raed.gh/driver_mobile`.
The production profile creates an App Store distribution IPA with the SDK 56
build image. Its update channel is `production-ios`, separate from Android's
`production` channel. Native dependencies use SDK 56 compatible patch versions.

## Verified production artifact — 2026-10-24

- **Version/build:** 1.0.0 (2), App Store distribution, arm64, iOS 16.4+.
- **Build:** [cd799bb6-7a38-4272-b22f-910a0e724fb2](https://expo.dev/accounts/raed.gh/projects/driver_mobile/builds/cd799bb6-7a38-4272-b22f-910a0e724fb2), completed successfully with the iOS 26.4 SDK.
- **File:** `/media/raed/Data/from ubuntu/Transpo_24 workspace/APPS/ios/driver/driver-v1.ipa` (31,176,979 bytes).
- **SHA-256:** `5a2ee98bbc0ccd430274a64f30ffc97071a187c62272b3f4c7ec793966b8a3e2`.
- **Validated in the IPA:** ZIP integrity, App Store provisioning profile CMS
  signature without trust-chain validation, driver identity, arm64 executable
  signing entitlements, production APNs, background location, HTTPS policy,
  privacy manifest, encryption declaration, unchanged Maps key, production API
  endpoint, dedicated update channel and matching EAS runtime fingerprint.
- **Runtime fingerprint:** `2ecdc318f84e1e2a506917fa3782be5a48070b87`.
- **Local checks:** TypeScript, ESLint, privacy check, production configuration
  check, and all 53 Jest suites / 310 tests passed. Expo Doctor passed 21/22
  checks; its remaining failure is the Hermes warning documented below.

The archive is prepared for App Store Connect upload. Physical-device/TestFlight
testing, the known issues below, and App Store metadata remain outstanding.
Full Apple code-signature validation requires Apple tooling. No App Store
submission or public release was performed.

## Build and checks

```sh
npm run typecheck
npm run lint
npm test -- --watch=false
npx expo-doctor
npm run ios:release:check
npm run build:production:ios
```

The release check reads the EAS production environment, checks the driver bundle
identifier, production HTTPS endpoints, icon dimensions, background location,
notifications, and iOS update channel. Local `.env` files and generated native
directories are excluded from the EAS source archive. The iOS Maps key is a
sensitive production variable in EAS; it is not written into this document.
The app embeds public Maps keys as required by the native SDK, so Google Cloud
restrictions still need to match the driver bundle identifier.

## Known release issues found on 2026-10-24

- **Google Directions:** The existing driver iOS Maps key returned
  `REQUEST_DENIED`: the key is not authorized for this service/API. The driver
  route polyline uses this endpoint, so route lines can be missing. Enable
  Directions API for the appropriate Google Cloud project/key and verify that
  Maps SDK for iOS is enabled and the key permits `com.transpo24.driver`.
  Confirm both map tiles and route lines on an iPhone. The user requested that
  the build continue with this issue documented. Changing Google Cloud settings
  for the same embedded key normally does not require rebuilding the app.
- **Hermes memory regression:** Expo Doctor reports that SDK 56's React Native
  0.85.3 / Hermes V1 is affected by a known memory regression with Worklets and
  Reanimated. SDK 56 patch updates do not resolve this. Expo's supported fix is
  upgrading to SDK 57 with Expo 57.0.9 or later and matching React Native
  dependencies. This release retains SDK 56. See the
  [Expo SDK 57 regression notes](https://expo.dev/changelog/sdk-57#known-regressions).
- **Dependency advisories:** `npm audit --omit=dev` reports 16 advisories
  (1 critical, 11 high, 4 moderate), including Expo's transitive CLI/build
  dependencies. These results require dependency/exposure review; no forced
  upgrades or SDK downgrades were applied to silence the report.

## Before App Store deployment

1. Resolve the Directions API configuration and Hermes warning above.
2. Test the signed build through TestFlight on a physical iPhone: launch,
   login/OTP, account deletion, document/photo uploads, maps and routing,
   offers and accepted jobs, chat attachments, and push notifications.
3. Verify active pickup/delivery tracking while the app is backgrounded and the
   phone is locked; tracking must stop when the trip ends or the driver signs out.
4. Create or select the **driver** App Store Connect app for
   `com.transpo24.driver`. Set its numeric app ID as
   `submit.production.ios.ascAppId` in `eas.json`; do not reuse the client app ID.
5. Complete screenshots, support/privacy URLs, privacy disclosures (including
   precise/background location), age rating, review notes, and working reviewer
   access in App Store Connect.
6. Verify the encryption declaration remains accurate if encryption dependencies
   change. This app uses standard HTTPS and OS Keychain storage and declares
   `usesNonExemptEncryption: false`, following the
   [Expo SecureStore guidance](https://docs.expo.dev/versions/v56.0.0/sdk/securestore/#exempting-encryption-prompt).

When ready to upload the chosen build to App Store Connect:

```sh
eas submit --platform ios --profile production --id <driver-build-id>
```

Submission uploads to App Store Connect/TestFlight; App Store review and public
release are separate steps. No store submission is performed by the build command.

For compatible JavaScript/assets updates after releasing the native build:

```sh
npm run update:production:ios -- --message "Describe the driver fix"
```

Native configuration/dependency changes require a new signed build.

## Locked-screen tracking

The access token and active-trip ID use Keychain's
`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` accessibility. This lets an active-trip task
read them after the phone is locked, once the device has been unlocked after
reboot. The entries remain restricted to this device. Remembered passwords and
other account data retain their existing accessibility settings. Confirm actual
locked-screen location delivery on a physical iPhone before release.
