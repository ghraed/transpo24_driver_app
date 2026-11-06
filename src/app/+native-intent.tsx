import { queueRequestLink } from '@/lib/pending-request-link';

// Capture native intents before login/onboarding redirects can consume their path.
export async function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try { return await queueRequestLink(path) ? (initial ? '/' : null) : path; }
  catch { return '/'; }
}
