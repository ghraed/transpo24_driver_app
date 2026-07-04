import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'transpo24.driver.accessToken';
const REMEMBERED_EMAIL_KEY = 'transpo24.driver.rememberedEmail';
const REMEMBERED_PASSWORD_KEY = 'transpo24.driver.rememberedPassword';
const LAST_ONBOARDING_ROUTE_KEY = 'transpo24.driver.lastOnboardingRoute';
const ONBOARDING_DOCUMENTS_STATUS_KEY = 'transpo24.driver.onboardingDocumentsStatus';

export async function persistAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function readAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function persistRememberedCredentials(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, email);
  await SecureStore.setItemAsync(REMEMBERED_PASSWORD_KEY, password);
}

export async function readRememberedCredentials(): Promise<{ email: string; password: string } | null> {
  const [email, password] = await Promise.all([
    SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY),
    SecureStore.getItemAsync(REMEMBERED_PASSWORD_KEY),
  ]);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export async function clearRememberedCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY),
    SecureStore.deleteItemAsync(REMEMBERED_PASSWORD_KEY),
  ]);
}

export async function persistLastOnboardingRoute(route: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_ONBOARDING_ROUTE_KEY, route);
}

export async function readLastOnboardingRoute(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_ONBOARDING_ROUTE_KEY);
}

export async function clearLastOnboardingRoute(): Promise<void> {
  await SecureStore.deleteItemAsync(LAST_ONBOARDING_ROUTE_KEY);
}

export async function persistOnboardingDocumentsStatus(status: string): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_DOCUMENTS_STATUS_KEY, status);
}

export async function readOnboardingDocumentsStatus(): Promise<string | null> {
  return SecureStore.getItemAsync(ONBOARDING_DOCUMENTS_STATUS_KEY);
}

export async function clearOnboardingDocumentsStatus(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_DOCUMENTS_STATUS_KEY);
}
