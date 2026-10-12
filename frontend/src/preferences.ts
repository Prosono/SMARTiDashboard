/** Browser preferences are optional. Ingress shares storage with the HA origin. */
export function readPreference(
  key: string,
  fallback: string,
  allowed: readonly string[],
): string {
  try {
    const value = globalThis.localStorage.getItem(key);
    return value !== null && allowed.includes(value) ? value : fallback;
  } catch {
    // Access itself can fail in restricted/private browsing contexts.
    return fallback;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Full or blocked storage must never prevent rendering or home controls.
    // React state retains the current choice; do not evict HA's storage.
  }
}
