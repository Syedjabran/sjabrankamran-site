/**
 * Full-screen helpers for Exam Lab attempts.
 *
 * EVERY attempt — practice drill, assignment or proctored test — is sat in
 * full-screen. The request must originate from the user gesture that starts
 * the attempt (the Start/Begin click); browsers reject a request made from a
 * timer, an effect or a navigation, so the caller keeps these calls inside the
 * click handler chain.
 *
 * Full-screen is a nice-to-have, never a gate:
 *   - iOS Safari on iPhone exposes NO element full-screen API at all
 *     (only <video> can go full-screen), so `fullscreenSupported()` is false
 *     there and the attempt simply runs windowed.
 *   - iPadOS Safari and older WebKit expose the `webkit*` prefixed API.
 *   - A request can also be refused by policy (permissions-policy, an iframe
 *     without `allow="fullscreen"`, or a user who declines).
 *
 * Every function here swallows its own errors and returns a plain boolean, so
 * no caller can ever leave a student stuck behind a rejected promise.
 */

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitCurrentFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
};

function doc(): FsDocument | null {
  return typeof document === "undefined" ? null : (document as FsDocument);
}

/** Can this browser put an ordinary element full-screen at all? */
export function fullscreenSupported(): boolean {
  const d = doc();
  if (!d?.documentElement) return false;
  const el = d.documentElement as FsElement;
  const hasApi = !!(el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen);
  if (!hasApi) return false;
  // `fullscreenEnabled` is false when policy forbids it (e.g. a sandboxed frame).
  if (d.fullscreenEnabled === false && d.webkitFullscreenEnabled !== true && d.msFullscreenEnabled !== true) return false;
  return true;
}

/** Are we currently full-screen? Prefixed engines included. */
export function isFullscreen(): boolean {
  const d = doc();
  if (!d) return false;
  return !!(d.fullscreenElement || d.webkitFullscreenElement || d.webkitCurrentFullScreenElement || d.msFullscreenElement);
}

/**
 * Put the whole document full-screen. MUST be called synchronously from a user
 * gesture. Resolves `true` only when we actually ended up full-screen; a
 * refusal or an unsupported browser resolves `false` and never throws.
 */
export async function requestExamFullscreen(): Promise<boolean> {
  const d = doc();
  if (!d?.documentElement) return false;
  if (isFullscreen()) return true;
  const el = d.documentElement as FsElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
  if (!req) return false;
  try {
    // Called before any `await` so the user activation is still live.
    await req.call(el);
  } catch {
    return false; // refused / unsupported — the attempt runs windowed.
  }
  return isFullscreen();
}

/** Leave full-screen when the attempt ends. Safe to call when already out. */
export async function exitExamFullscreen(): Promise<void> {
  const d = doc();
  if (!d || !isFullscreen()) return;
  const exit = d.exitFullscreen || d.webkitExitFullscreen || d.webkitCancelFullScreen || d.msExitFullscreen;
  if (!exit) return;
  try { await exit.call(d); } catch { /* already out, or refused — nothing to do */ }
}

/**
 * Subscribe to full-screen changes across engines. Returns an unsubscribe.
 * `webkitfullscreenchange` is the iPadOS/older-Safari spelling.
 */
export function onFullscreenChange(handler: (standardEvent: boolean) => void): () => void {
  const d = doc();
  if (!d) return () => {};
  const std = () => handler(true);
  const webkit = () => handler(false);
  d.addEventListener("fullscreenchange", std);
  d.addEventListener("webkitfullscreenchange", webkit);
  d.addEventListener("MSFullscreenChange", webkit);
  return () => {
    d.removeEventListener("fullscreenchange", std);
    d.removeEventListener("webkitfullscreenchange", webkit);
    d.removeEventListener("MSFullscreenChange", webkit);
  };
}
