/**
 * The portal's brand: its name, the site it lives on, who its emails come
 * from and where people write for help. Pure (the web manifest, server
 * pages, client components, the email builders and plain Node tests import
 * it).
 *
 * The name is subject-neutral ("Learning Portal", formerly "Physics Portal"):
 * the portal teaches more than one subject, and the top bar shows it on every
 * page to every student, SAT-only ones included. Which subjects the portal
 * teaches comes from the subject registry (subjects.ts), and course-specific
 * wording (a welcome email's first lines, the progress report's teacher) is
 * there too; portal-emails.ts puts the two together.
 *
 * A rebrand of the portal is a change here, and only here: the top bar, the
 * install pages and web manifest (an installed app picks a new name up when
 * the browser next refreshes the manifest), the account, password and
 * progress emails (the SAT section's sign-off too), the mail console, the
 * suspended and locked screens, the registration pages' help address and the
 * Exam Lab's paper watermark all read these. scripts/test-portal-emails.mjs
 * fails if the mailbox or the sign-in link is written out anywhere else.
 */
export const PORTAL_NAME = "Learning Portal";

/** The installed app's full name (the web manifest's `name`). */
export const PORTAL_APP_NAME = `SJAK ${PORTAL_NAME}`;

/** The site the portal is on, as emails print it. */
export const PORTAL_SITE_NAME = "sjabrankamran.com";

/** The site's canonical origin (no www: www redirects here). */
export const PORTAL_SITE_URL = "https://sjabrankamran.com";

/** The sign-in page, as emails and the admin tools link to it. */
export const PORTAL_LOGIN_URL = `${PORTAL_SITE_URL}/portal/login`;

/** The portal's mailbox: its emails are sent from it, replies go to it, its
 *  Google Drive is the one Resources imports from, and the suspended and
 *  locked screens point students to it for help. */
export const PORTAL_CONTACT_EMAIL = "physics@sjabrankamran.com";

/** Who signs the portal's emails, and who the AI progress report writes as. */
export const PORTAL_SENDER_NAME = "Syed Jabran Ali Kamran";

/** The display name the portal's emails are sent under. */
export const PORTAL_MAIL_FROM_NAME = `${PORTAL_SENDER_NAME} — Physics`;

/** What a generated password starts with (admin.ts genPassword). Only newly
 *  generated passwords use it; no existing password is ever checked against
 *  it, so changing it affects none. */
export const GENERATED_PASSWORD_PREFIX = "Phy-";
