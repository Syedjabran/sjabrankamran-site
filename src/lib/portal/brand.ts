/**
 * The portal's own name: what the installed app is called on a phone and what
 * the install pages call it. Pure (the web manifest, server pages and client
 * components import it).
 *
 * It is subject-neutral ("Learning Portal", formerly "Physics Portal"): the
 * portal teaches more than one subject, and the top bar shows it on every
 * page to every student, SAT-only ones included. Which subjects the portal
 * teaches comes from the subject registry (subjects.ts). Rename the portal
 * here, and only here; an installed app picks the new name up from the web
 * manifest when the browser next refreshes it.
 */
export const PORTAL_NAME = "Learning Portal";

/** The installed app's full name (the web manifest's `name`). */
export const PORTAL_APP_NAME = `SJAK ${PORTAL_NAME}`;
