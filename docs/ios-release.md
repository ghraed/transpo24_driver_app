# Driver iOS release

The production iOS app uses `com.transpo24.driver`, Apple team `GQ79L2HQU5`
(Autobasilea GmbH), and the EAS project `@raed.gh/driver_mobile`.
The production profile creates an App Store distribution IPA with the SDK 56
build image. Its update channel is `production-ios`, separate from Android's
`production` channel. Native dependencies use SDK 56 compatible patch versions.

## Latest routing production artifact — 2026-10-25

- **Version/build:** 1.0.0 (4), App Store distribution.
- **Build:** [d12bf61a-807a-469f-bd80-cef73f673b6e](https://expo.dev/accounts/raed.gh/projects/driver_mobile/builds/d12bf61a-807a-469f-bd80-cef73f673b6e).
- **File:** `/media/raed/Data/from ubuntu/Transpo_24 workspace/APPS/ios/driver/driver-v1-build4.ipa`.
- **SHA-256:** `5c9ee645d22a30572542e27c94c7a1509a5772ff30ed6b63d5ae9cedbf7d426d`.
- **Runtime fingerprint:** `4613f9332abce3c60aed41c553ccfcb8887ba077`.
- Both active route request paths use authenticated production backend requests.
  The backend Routes module is deployed and returns three real route alternatives.
  Its server-only key is absent from every file in the IPA. The native Maps key
  still matches the new ignored local iOS key and EAS production configuration.
- Verified production signing/APNs, background location, API endpoint,
  `production-ios` channel, and matching runtime fingerprint.
- Checks passed: driver typecheck, lint and all 54 suites / 312 tests; API build,
  lint and 14 focused service/transport/authentication/validation/rate-limit tests.
- Use build 4 for iPhone/TestFlight testing. Earlier builds do not contain this
  backend routing migration. The Hermes/dependency warnings below remain.
- Production deployment details: [backend routing notes](../../api/docs/routes-production.md).

## Previous map-key artifact — 2026-10-25

- **Version/build:** 1.0.0 (3), App Store distribution.
- **Build:** [5302733b-f873-4e6f-b8db-ab38b12d79fb](https://expo.dev/accounts/raed.gh/projects/driver_mobile/builds/5302733b-f873-4e6f-b8db-ab38b12d79fb).
- **File:** `/media/raed/Data/from ubuntu/Transpo_24 workspace/APPS/ios/driver/driver-v1-build3.ipa`.
- **SHA-256:** `716a0c9113ed98328df40f1d7ab974bb94aa35743f494317e9366eb193313b00`.
- **Runtime fingerprint:** `4613f9332abce3c60aed41c553ccfcb8887ba077`.
- The new iOS map-display key was moved from tracked `.env` to ignored
  `.env.local` and updated as a sensitive EAS production variable. Other local
  settings were preserved. The production configuration and the embedded IPA
  Maps key were both verified to match the new local key without logging it.
- IPA signing/provisioning, production APNs, production API endpoint, background
  location, and `production-ios` channel checks passed.
- Build 2 below contains the previous key. Use build 3 for subsequent testing.
  Verify map tiles on a physical iPhone. Directions/Routes backend migration
  and the existing release issues below remain outstanding.

## Previous production artifact — 2026-10-24

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

### Shell shortcuts

The zsh aliases `transpo_dbuild` and `transpo_dupload` invoke
`scripts/driver-release.cjs` with an absolute path, so they work from any directory.
Open a new terminal or run `source ~/.zshrc` after installing the aliases.

- `transpo_dbuild`: run lint, typecheck, tests and the iOS release check, bump
  the app patch version once, build the Android AAB locally, then build iOS in EAS.
  The AAB is saved to `dist/releases/transpo24-driver-<version>.aab`.
- `transpo_dbuild --no-bump`: retry using the current app version. EAS still
  increments native build numbers.
- `transpo_dupload`: upload that version's local AAB to Google Play, then
  interactively select an iOS production build to upload to App Store Connect.
- `transpo_dupload --platform ios`: upload only an existing iOS build; no local
  AAB or rebuild is required. Select build `d12bf61a-807a-469f-bd80-cef73f673b6e`
  for version 1.0.0 (4), or the appropriate newer production build.
- `transpo_dupload --platform android`: upload only the current local AAB.

For the first iOS upload, create or select **Transpo24 - Driver** in App Store
Connect using bundle ID `com.transpo24.driver` and team Autobasilea GmbH.
EAS will prompt for Apple authentication and the app when needed. Its numeric
Apple ID can then be saved as `submit.production.ios.ascAppId` in `eas.json`.
Use the driver app's ID, not the client's. After Apple processes the upload,
test it through TestFlight and complete App Review separately.

These commands build or upload only when you run them. Local Android builds
require an Android SDK and Java, plus production secret/file variables locally.
Commit the bumped `app.json` with the release changes.

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

- **Routing migration:** Resolved in the production backend and the build 4
  client source on 2026-10-25. Driver polylines and on-my-way alternatives now
  use authenticated `/driver/routes/compute` requests. The backend uses Google
  Routes API with an IP-restricted, server-only credential and verified IPv4
  egress. Production returned valid routes. Physical iPhone route testing is
  still required; unrelated Places/Geocoding requests are outside this migration.
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

1. Verify the new production route flow on an iPhone and resolve the Hermes warning above.
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
