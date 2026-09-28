type StoreError = { code?: string | null; message?: string | null };

// PostgREST reports an unknown function/table as PGRST202/PGRST205; Postgres as 42883/42P01.
const MISSING_STORE_CODES = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);

let storeMissing = false;

export const isMissingStoreError = (error: unknown) =>
  MISSING_STORE_CODES.has(String((error as StoreError | null)?.code ?? ''));

/** False once the auth_throttle_store migration is known to be missing; callers then use process memory. */
export const authStoreAvailable = () => !storeMissing;

/** Returns true (and stops using the database) when `error` means the tables/functions are not deployed. */
export function switchToMemoryIfMissing(error: unknown) {
  if (!isMissingStoreError(error)) return false;
  if (!storeMissing) {
    console.warn(
      'Auth throttle store is not deployed (apply the auth_throttle_store migration); ' +
        'rate limits and one-time codes fall back to per-instance memory.'
    );
  }
  storeMissing = true;
  return true;
}

export function resetAuthStoreFallback() {
  storeMissing = false;
}
