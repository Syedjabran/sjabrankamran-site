// src/lib/exam-lab/keys.ts
//
// SERVER-ONLY. The keys behind Exam Lab sitting tokens, Maxwell receipts and
// sealed practice sets (seal.ts). EXAM_LAB_SECRET when set; otherwise a key
// derived (HKDF, one per purpose) from the service-role key the server
// already holds, so a deployment without the new variable keeps working and
// the derived keys never reveal the service key. No secret at all: null,
// and every caller refuses (fails closed) rather than issue unsigned data.
import "server-only";
import { deriveKey } from "./seal";

export type KeyPurpose = "sitting" | "receipt" | "practice-set";

export function examLabKey(purpose: KeyPurpose): Buffer | null {
  const secret = process.env.EXAM_LAB_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret.length < 16) return null;
  return deriveKey(secret, `exam-lab:${purpose}:v1`);
}
