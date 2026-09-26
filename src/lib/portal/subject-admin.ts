/**
 * Admin-side subject switching. SERVER-ONLY.
 *
 * Shared by the per-user subjects route and account creation, so both grant
 * a direct subject and tell the student about it the same way. Kept apart
 * from subject-grants.ts so course access (which reads grants on every
 * portal page) never pulls in the notification centre.
 */
import "server-only";
import { notify, type NotifyInput } from "@/lib/portal/notifications";
import { readGrants, setGrant, type SubjectGrants } from "@/lib/portal/subject-grants";
import type { SubjectId } from "@/lib/portal/subjects";

/** What the student's bell says when an admin opens a subject for them. */
const OPENED_NOTICE: Partial<Record<SubjectId, NotifyInput>> = {
  sat: { type: "sat", title: "SAT Lab is open for you", body: "Set your exam date and start your plan.", href: "/portal/sat-lab" },
};

/**
 * Switch a direct-grant subject on or off (setGrant: fresh read, write,
 * verify) and, when it goes from off to on, notify the student. Throws when
 * the grants record can't be read or saved; the notification itself is
 * best-effort.
 */
export async function switchSubject(uid: string, subject: SubjectId, on: boolean, by: string): Promise<SubjectGrants> {
  const wasOn = on && Boolean((await readGrants(uid)).grants[subject]);
  const saved = await setGrant(uid, subject, on, by);
  const notice = OPENED_NOTICE[subject];
  if (on && !wasOn && notice) await notify({ uids: [uid] }, notice);
  return saved;
}
