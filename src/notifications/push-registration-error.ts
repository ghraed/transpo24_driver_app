export class PushConfigurationError extends Error {
  constructor() {
    super(
      'Android push requires Firebase configuration in the installed app. For Driver Dev, register com.transpo24.driver.dev in Firebase, save google-services.dev.json, set EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE=./google-services.dev.json in .env.local, and rebuild with npm run android:usb. Reloading Metro cannot add native Firebase configuration.',
    );
    this.name = 'PushConfigurationError';
  }
}

export function isMissingFirebaseConfiguration(error: unknown): boolean {
  return error instanceof Error &&
    /Default FirebaseApp is not initialized|Unable to get Firebase Messaging instance/i.test(error.message);
}
