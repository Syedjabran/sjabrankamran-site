/**
 * Pure and edge-safe: whether a Supabase Storage object read failed because
 * the object doesn't exist. Shared by storage-fresh.ts (server) and the
 * middleware's /lab gate, so "missing" (start empty) and "failed" (unknown,
 * fail closed) are told apart the same way everywhere.
 */
export function isStorageNotFound(status: number, body: string): boolean {
  if (status === 404) return true;
  // Older Storage API versions answer a missing object with HTTP 400 and a
  // JSON body whose statusCode is "404".
  return status === 400 && /"statusCode"\s*:\s*"?404|not[ _-]?found/i.test(body);
}
