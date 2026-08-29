# Google Play release checklist

This document covers the Play Console work that cannot be completed from the app repository. The Android release itself is configured for package `com.transpo24.driver`, API level 36, Android App Bundle output, HTTPS-only production traffic, and remotely managed version codes.

## Build and test

1. In EAS, confirm the `production` environment contains the Android Google Maps key. Restrict that key in Google Cloud to the Android app package and the Play App Signing certificate fingerprint.
2. Build the store bundle:

   ```sh
   eas build --platform android --profile production
   ```

3. Install the Play-generated APK from Internal app sharing or an internal test track. Confirm the green **PRODUCTION** banner shows `https://api.transpo24.com`, then test registration, OTP, maps, document upload/camera, foreground trip location, notifications, chat reporting/blocking, Stripe onboarding, and account deletion on a physical Android device.
4. Upload to the internal track first. Promote the tested artifact to production; do not rebuild between tracks.

### Known Expo SDK 56 advisory

`expo-doctor` reports Expo SDK 56's known Hermes V1 memory-regression advisory. This is not a Google Play policy or bundle-validation failure, and the release build remains on Expo's supported default Hermes engine. Do not switch this project to JavaScriptCore: the SDK 56 React Native Worklets native build is incompatible with that fallback. Plan an SDK 57 upgrade separately after testing the Expo migration.

## Store listing

- App name: `Transpo24 - Driver`
- Package: `com.transpo24.driver`
- Category: choose the most accurate business/transport category.
- Support email: `info@transpo24.ch`
- Privacy policy: `https://transpo24.com/privacy`
- Account deletion: `https://transpo24.com/account-deletion`
- Supply an app icon, a 1024 x 500 feature graphic, at least two real phone screenshots, a short description, and a full description. Screenshots and descriptions must match the shipped driver app and must not promise unavailable features.

## App access for review

The app uses phone OTP and places approved-driver functionality behind authentication. In **Policy and programs > App content > App access**, provide an always-available reusable review account and English instructions that bypass expiring OTP requirements. The account should already have approved documents, an approved vehicle/load profile, and test jobs/chat data so reviewers can reach all main features without waiting for manual approval.

Do not submit until those credentials have been tested from a clean device outside the company network.

## Required App content declarations

- Privacy policy: use the public URL above.
- Ads: declare **No** unless advertising is added before release.
- App access: restricted; provide the review access described above.
- Target audience: drivers/transport providers of legal driving and contracting age; do not target children.
- Content rating: answer for marketplace communication, user-submitted text/photos, location sharing, and financial/payout functionality.
- News app: declare **No**.
- Financial features: complete the declaration. The app facilitates transport earnings and opens Stripe Connect payout onboarding; have the operator choose the accurate Play category, using **Other** if Play classifies this as a financial support feature.
- Data safety and account deletion: complete as described below and enter the public deletion URL.
- Foreground service/background location: the shipped app uses foreground-only location and does not request background-location or location-foreground-service permissions. Do not declare background tracking unless that behavior is added later.

## Data safety working inventory

The final answers must be verified by the operator against backend retention, processors, and production behavior. At minimum, review these collected data types:

- Approximate and precise location: matching, pickup/delivery verification, active-trip tracking, safety, fraud prevention, and dispute handling.
- Personal information: name, email, phone number, address, company/profile details, and user identifiers.
- Photos and files: identity, driving licence, vehicle, insurance, transport, pickup, and delivery evidence.
- Messages: in-app chat and support communications.
- Financial information: Stripe Connect payout account/status and transaction/earnings records; card or bank details may be collected directly by the payment processor.
- App activity: transport requests, offers, bookings, status changes, ratings, and interactions.
- Device or other identifiers: push notification token, IP address, device information, security/login records, and app version.

Production transport is encrypted. Account deletion is available in **Profile > Delete account**, and the external deletion page is available at the URL above. Any data retained for tax, accounting, fraud, disputes, or legal obligations must match the retention explanation in the privacy policy and the Data safety answers.

## Policy-sensitive behavior to preserve

- Keep Terms acceptance mandatory before account creation.
- Keep report-message, report-participant, block, and unblock controls available in every active 1:1 chat, and keep the moderation queue operational.
- Do not add `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, background location, or foreground-service-location permissions without a documented core need and the matching Play declaration.
- Increment the remote Android version code for every uploaded artifact. Never change the package name or Play App Signing identity after the first release.
