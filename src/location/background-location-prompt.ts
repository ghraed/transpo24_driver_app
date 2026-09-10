export type BackgroundLocationPromptChoice = { continue: boolean; dontShowAgain: boolean };
type PendingPrompt = { resolve: (choice: BackgroundLocationPromptChoice) => void; promise: Promise<BackgroundLocationPromptChoice> };
let pending: PendingPrompt | null = null;
const listeners = new Set<() => void>();

export function subscribeBackgroundLocationPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getBackgroundLocationPrompt(): boolean { return pending !== null; }
export function requestBackgroundLocationPrompt(): Promise<BackgroundLocationPromptChoice> {
  if (pending) return pending.promise;
  let resolve!: PendingPrompt['resolve'];
  const promise = new Promise<BackgroundLocationPromptChoice>(done => { resolve = done; });
  pending = { resolve, promise };
  listeners.forEach(listener => listener());
  return promise;
}
export function finishBackgroundLocationPrompt(choice: BackgroundLocationPromptChoice): void {
  const prompt = pending;
  pending = null;
  listeners.forEach(listener => listener());
  prompt?.resolve(choice);
}
