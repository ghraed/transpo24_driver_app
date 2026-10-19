const listeners = new Set<() => void>();

export function subscribeDriverApprovalRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyDriverApprovalRequired(): void {
  listeners.forEach((listener) => listener());
}
