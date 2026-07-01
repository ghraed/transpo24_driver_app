import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'transpo24.driver.accessToken';
const REMEMBERED_EMAIL_KEY = 'transpo24.driver.rememberedEmail';
const REMEMBERED_PASSWORD_KEY = 'transpo24.driver.rememberedPassword';
const REGISTER_DRAFT_KEY = 'transpo24.driver.registerDraft';

export interface DriverRegisterDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  countryCodes: string[];
  city: string;
}

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

export async function persistDriverRegisterDraft(draft: DriverRegisterDraft): Promise<void> {
  await SecureStore.setItemAsync(REGISTER_DRAFT_KEY, JSON.stringify(draft));
}

export async function readDriverRegisterDraft(): Promise<DriverRegisterDraft | null> {
  const raw = await SecureStore.getItemAsync(REGISTER_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DriverRegisterDraft>;
    return {
      firstName: typeof parsed.firstName === 'string' ? parsed.firstName : '',
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      password: typeof parsed.password === 'string' ? parsed.password : '',
      confirmPassword: typeof parsed.confirmPassword === 'string' ? parsed.confirmPassword : '',
      countryCodes: Array.isArray(parsed.countryCodes)
        ? parsed.countryCodes.filter((value): value is string => typeof value === 'string')
        : [],
      city: typeof parsed.city === 'string' ? parsed.city : '',
    };
  } catch {
    return null;
  }
}

export async function clearDriverRegisterDraft(): Promise<void> {
  await SecureStore.deleteItemAsync(REGISTER_DRAFT_KEY);
}
