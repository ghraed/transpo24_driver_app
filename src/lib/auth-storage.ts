import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'transpo24.driver.accessToken';
const TRUSTED_DRIVER_SESSION_KEY = 'transpo24.driver.trustedSession';
const REMEMBERED_EMAIL_KEY = 'transpo24.driver.rememberedEmail';
const REMEMBERED_PASSWORD_KEY = 'transpo24.driver.rememberedPassword';
const LAST_ONBOARDING_ROUTE_KEY = 'transpo24.driver.lastOnboardingRoute';
const ONBOARDING_DOCUMENTS_STATUS_KEY = 'transpo24.driver.onboardingDocumentsStatus';
const ONBOARDING_DOCUMENTS_DRAFT_KEY = 'transpo24.driver.onboardingDocumentsDraft';
const COMPLETE_PROFILE_DRAFT_KEY = 'transpo24.driver.completeProfileDraft';
const VEHICLE_INFORMATION_DRAFT_KEY = 'transpo24.driver.vehicleInformationDraft';
const LOAD_CAPACITY_DRAFT_KEY = 'transpo24.driver.loadCapacityDraft';
let completeProfileDraftWrite: Promise<void> = Promise.resolve();
let vehicleDraftWrite: Promise<void> = Promise.resolve();
let capacityDraftWrite: Promise<void> = Promise.resolve();

function scopedDraftKey(prefix: string, vehicleId: string): string {
  const encodedId = [...vehicleId].map((character) =>
    character.codePointAt(0)!.toString(16).padStart(6, '0')).join('');
  return `${prefix}.${encodedId}`;
}

async function readDraftIds(prefix: string): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(`${prefix}.index`);
  if (!raw) return [];
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function persistScopedDraft(prefix: string, vehicleId: string, draft: string): Promise<void> {
  const ids = await readDraftIds(prefix);
  if (!ids.includes(vehicleId)) {
    await SecureStore.setItemAsync(`${prefix}.index`, JSON.stringify([...ids, vehicleId]));
  }
  await SecureStore.setItemAsync(scopedDraftKey(prefix, vehicleId), draft);
}

async function clearScopedDraft(prefix: string, vehicleId?: string): Promise<void> {
  const ids = await readDraftIds(prefix);
  if (vehicleId) {
    await SecureStore.deleteItemAsync(scopedDraftKey(prefix, vehicleId));
    const remaining = ids.filter((id) => id !== vehicleId);
    if (remaining.length) {
      await SecureStore.setItemAsync(`${prefix}.index`, JSON.stringify(remaining));
    } else {
      await SecureStore.deleteItemAsync(`${prefix}.index`);
    }
    return;
  }
  await Promise.all(ids.map((id) => SecureStore.deleteItemAsync(scopedDraftKey(prefix, id))));
  await SecureStore.deleteItemAsync(`${prefix}.index`);
  // Remove drafts written by older app versions; they are not tied to a vehicle.
  await SecureStore.deleteItemAsync(prefix);
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

export type TrustedDriverSession = {
  accessToken: string;
  phoneNumber: string;
};

export async function persistTrustedDriverSession(
  session: TrustedDriverSession,
): Promise<void> {
  await SecureStore.setItemAsync(
    TRUSTED_DRIVER_SESSION_KEY,
    JSON.stringify(session),
  );
}

export async function readTrustedDriverSession(): Promise<TrustedDriverSession | null> {
  const rawSession = await SecureStore.getItemAsync(TRUSTED_DRIVER_SESSION_KEY);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession) as Partial<TrustedDriverSession>;
    if (
      typeof session.accessToken !== 'string' ||
      typeof session.phoneNumber !== 'string'
    ) {
      throw new Error('Invalid trusted driver session');
    }
    return session as TrustedDriverSession;
  } catch {
    await SecureStore.deleteItemAsync(TRUSTED_DRIVER_SESSION_KEY);
    return null;
  }
}

export async function clearTrustedDriverSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TRUSTED_DRIVER_SESSION_KEY);
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

export function persistCompleteProfileDraft(draft: string): Promise<void> {
  completeProfileDraftWrite = completeProfileDraftWrite
    .catch(() => {})
    .then(() => SecureStore.setItemAsync(COMPLETE_PROFILE_DRAFT_KEY, draft));
  return completeProfileDraftWrite;
}

export async function readCompleteProfileDraft(): Promise<string | null> {
  await completeProfileDraftWrite.catch(() => {});
  return SecureStore.getItemAsync(COMPLETE_PROFILE_DRAFT_KEY);
}

export function clearCompleteProfileDraft(): Promise<void> {
  completeProfileDraftWrite = completeProfileDraftWrite
    .catch(() => {})
    .then(() => SecureStore.deleteItemAsync(COMPLETE_PROFILE_DRAFT_KEY));
  return completeProfileDraftWrite;
}

export async function persistOnboardingDocumentsDraft(draft: string): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_DOCUMENTS_DRAFT_KEY, draft);
}

export async function readOnboardingDocumentsDraft(): Promise<string | null> {
  return SecureStore.getItemAsync(ONBOARDING_DOCUMENTS_DRAFT_KEY);
}

export async function clearOnboardingDocumentsDraft(): Promise<void> {
  await SecureStore.deleteItemAsync(ONBOARDING_DOCUMENTS_DRAFT_KEY);
}

export function persistVehicleInformationDraft(vehicleId: string, draft: string): Promise<void> {
  vehicleDraftWrite = vehicleDraftWrite.catch(() => {}).then(() =>
    persistScopedDraft(VEHICLE_INFORMATION_DRAFT_KEY, vehicleId, draft));
  return vehicleDraftWrite;
}

export async function readVehicleInformationDraft(vehicleId: string): Promise<string | null> {
  await vehicleDraftWrite.catch(() => {});
  return SecureStore.getItemAsync(scopedDraftKey(VEHICLE_INFORMATION_DRAFT_KEY, vehicleId));
}

export function clearVehicleInformationDraft(vehicleId?: string): Promise<void> {
  vehicleDraftWrite = vehicleDraftWrite.catch(() => {}).then(() =>
    clearScopedDraft(VEHICLE_INFORMATION_DRAFT_KEY, vehicleId));
  return vehicleDraftWrite;
}

export function persistLoadCapacityDraft(vehicleId: string, draft: string): Promise<void> {
  capacityDraftWrite = capacityDraftWrite.catch(() => {}).then(() =>
    persistScopedDraft(LOAD_CAPACITY_DRAFT_KEY, vehicleId, draft));
  return capacityDraftWrite;
}

export async function readLoadCapacityDraft(vehicleId: string): Promise<string | null> {
  await capacityDraftWrite.catch(() => {});
  return SecureStore.getItemAsync(scopedDraftKey(LOAD_CAPACITY_DRAFT_KEY, vehicleId));
}

export function clearLoadCapacityDraft(vehicleId?: string): Promise<void> {
  capacityDraftWrite = capacityDraftWrite.catch(() => {}).then(() =>
    clearScopedDraft(LOAD_CAPACITY_DRAFT_KEY, vehicleId));
  return capacityDraftWrite;
}

export async function clearDriverOnboardingDrafts(): Promise<void> {
  await Promise.all([
    clearCompleteProfileDraft(),
    clearOnboardingDocumentsStatus(),
    clearOnboardingDocumentsDraft(),
    clearVehicleInformationDraft(),
    clearLoadCapacityDraft(),
  ]);
}
