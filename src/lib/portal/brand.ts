/**
 * The portal's own name: what the installed app is called on a phone and what
 * the install pages call it. Pure (the web manifest, server pages and client
 * components import it).
 *
 * It still reads "Physics Portal" -- the name students already installed the
 * app under -- so nothing changes for them. It is a name, not a statement
 * about which subjects the portal teaches (those come from the subject
 * registry, subjects.ts): rename the portal here, and only here.
 */
export const PORTAL_NAME = "Physics Portal";

/** The installed app's full name (the web manifest's `name`). */
export const PORTAL_APP_NAME = `SJAK ${PORTAL_NAME}`;
