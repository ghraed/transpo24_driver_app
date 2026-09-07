# Driver OTA updates

This project mirrors the client app's Expo SDK 56 setup, using the driver's own
EAS project `9adb6313-42fb-4399-b3ea-6e040805a8a4`.

- `expo-updates` checks and downloads on a cold app launch (`ON_LOAD`).
- The app starts immediately from its cached/embedded bundle.
- The banner shows download progress, a user-controlled **Restart now** action,
  failures, and confirmation when a downloaded update is running.
- There is no automatic reload in the middle of a driver task. A downloaded
  update also applies on the next app launch.
- OTA checks are not periodic while the app remains open. Close and reopen it
  to trigger another startup check.
- Runtime compatibility uses `appVersion`: currently `1.0.0`.

## First installation and device verification

The recent driver builds inspected on 2026-09-07 (production version code 5 and
production-apk version code 6) have no update channel or runtime version. They
cannot receive this setup over OTA. Install a newly built binary first.

Run commands from `driver_mobile`, not `client_mobile/app`.

1. Build an APK with the new configuration:

   ```sh
   eas build --platform android --profile production-apk
   ```

2. Install that APK on the phone and launch it once. This is a release build;
   Expo Go or a Metro development session does not verify this OTA flow.
3. Make a small, visible JS/text change, keeping `expo.version` at `1.0.0`.
4. Publish to this APK's channel:

   ```sh
   npm run update:production-apk -- --platform android --message "Driver OTA smoke test"
   ```

5. Fully close and reopen the app while connected to the internet. Wait for
   **Update ready**, tap **Restart now**, and verify the visible change and
   **Update applied** banner. If download finishes before the banner is visible,
   reopening once more should apply it. Merely seeing a successful CLI upload
   does not establish that a phone downloaded and launched it.

## Store builds and subsequent updates

Build and distribute the OTA-enabled store binary:

```sh
eas build --platform android --profile production
```

After users install that binary, publish compatible JS/assets changes:

```sh
eas update --channel production --environment production --platform android --message "fixed swiss vin"
# Equivalent shortcut:
npm run update:production -- --platform android --message "fixed swiss vin"
```

Omit `--platform android` to publish for both Android and iOS, if both have
compatible installed builds. Publishing does not install a new native binary.
The backend changes for recovering unresolved driver jobs must be deployed to
the API separately; an OTA update cannot deploy backend code.

## Channel and environment mapping

| Build profile | Update channel | EAS environment |
| --- | --- | --- |
| production | production | production |
| production-apk | production-apk | production |
| preview | preview | preview |
| play-test | play-test | preview |
| development | development | development |

A `production` update does not reach a `production-apk` build. The same channel
name in the client and driver projects does not mix their updates: their project
IDs and update URLs are different. EAS channels must point to the branch you
publish to; `eas channel:view production` can inspect an existing mapping.

SDK 56 requires `--environment` for `eas update`. Update publishing does not use
`build.<profile>.env` from `eas.json`. Use matching EAS-hosted environment
variables for builds and updates.

The driver production environment was checked on 2026-09-07: `EXPO_PUBLIC_APP_ENV`
is `production`, and the following four variables point to
`https://api.transpo24.com`:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SOCKET_URL`
- `EXPO_PUBLIC_ANDROID_API_URL`
- `EXPO_PUBLIC_ANDROID_SOCKET_URL`

The preview environment did not pass this check. Configure those five values in
EAS preview before publishing preview/play-test updates. Verify Maps keys and
Google services configuration for a new native build too; the audit did not
confirm the Maps keys. Never place private server credentials in EXPO_PUBLIC
variables.

## When a new store build is required

With the `appVersion` runtime policy, JS/UI/assets-only updates keep the same
`expo.version` as their target installed binary. Changes to native dependencies,
Expo SDK, config plugins, permissions, native API keys, or other native settings
require increasing `expo.version` and creating/installing a new binary. The
remote Android version code increment alone does not change this runtime.
Do not publish native-incompatible code to the old runtime.

Before publishing, run:

```sh
npm run typecheck
npm test -- --runTestsByPath src/components/ota-update-banner.test.js
```

References:
- https://docs.expo.dev/versions/v56.0.0/sdk/updates/
- https://docs.expo.dev/eas-update/getting-started/
- https://docs.expo.dev/eas/environment-variables/usage/
