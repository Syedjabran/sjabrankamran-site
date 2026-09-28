import assert from "node:assert/strict";
import vm from "node:vm";
import {
  navigationDecision, normalisePath, originString, parseHttpUrl, parseOrigin, resolveWebTarget, sameOrigin,
} from "../src/web/portal-url.ts";
import { cookieHeader, sessionCookieScript } from "../src/web/session-script.ts";

// Which links the app opens with the user's portal session (src/web/portal-url.ts)
// and how the session is written into the WebView (src/web/session-script.ts).
// Run: `npm test` here, or the site's `npm run test:portal`.

const SITE = parseOrigin("https://sjabrankamran.com");
const PORTAL = "https://sjabrankamran.com";
const target = (input) => resolveWebTarget(input, SITE);
const kind = (input) => target(input).kind;

// --- the portal's own origin ----------------------------------------------------------

assert.deepEqual(SITE, { scheme: "https", host: "sjabrankamran.com", port: "" });
assert.equal(originString(SITE), PORTAL);
assert.deepEqual(parseOrigin("https://sjabrankamran.com/"), SITE, "a trailing slash is fine");
assert.deepEqual(parseOrigin("http://192.168.1.20:3000"), { scheme: "http", host: "192.168.1.20", port: "3000" }, "a local dev server");
for (const bad of ["sjabrankamran.com", "https://sjabrankamran.com/portal", "ftp://sjabrankamran.com", "https://user@sjabrankamran.com", ""]) {
  assert.throws(() => parseOrigin(bad), /must be an http\(s\) address/, `config ${JSON.stringify(bad)} is refused`);
}

// Portal paths open signed in, normalised.
assert.deepEqual(target("/portal/exam-lab"), { kind: "portal", url: `${PORTAL}/portal/exam-lab`, path: "/portal/exam-lab" });
assert.deepEqual(target("/portal/library?thread=t1"), { kind: "portal", url: `${PORTAL}/portal/library?thread=t1`, path: "/portal/library?thread=t1" });
assert.deepEqual(target("/portal/sat-lab#sat-practice"), { kind: "portal", url: `${PORTAL}/portal/sat-lab#sat-practice`, path: "/portal/sat-lab#sat-practice" });
assert.equal(target("/portal/subjects/physics").url, `${PORTAL}/portal/subjects/physics`);
assert.equal(target("/portal").url, `${PORTAL}/portal`);
assert.equal(target("/portal/a/../b/./c").path, "/portal/b/c", "dot segments resolved");
assert.equal(target("/portal/%2e%2e/%2E%2e/lab/").path, "/lab/", "encoded dot segments too, never above the root");
assert.equal(target("/../../../etc").path, "/etc");
assert.equal(target("/.//evil.tld/x").path, "/evil.tld/x", "a path never becomes //host");
assert.equal(target("/portal/x?next=//evil.tld#../../y").path, "/portal/x?next=//evil.tld#../../y", "query and fragment untouched");
// The same origin written out in full is the portal too; another scheme or port is not.
assert.deepEqual(target("https://sjabrankamran.com/portal/learn"), { kind: "portal", url: `${PORTAL}/portal/learn`, path: "/portal/learn" });
assert.equal(target("HTTPS://SJABRANKAMRAN.COM:443/portal").url, `${PORTAL}/portal`, "scheme and host case, default port");
assert.equal(target("https://sjabrankamran.com").path, "/");
assert.equal(target("https://sjabrankamran.com?x=1").path, "/?x=1");
assert.equal(kind("http://sjabrankamran.com/portal"), "external", "plain http is another origin");
assert.equal(kind("https://sjabrankamran.com:8443/portal"), "external", "another port is another origin");
assert.equal(kind("https://www.sjabrankamran.com/portal"), "external", "a sibling subdomain is another origin");
assert.equal(kind("https://sjabrankamran.com./portal"), "external", "a trailing-dot host is not the portal's host");

// --- the evil cases ------------------------------------------------------------------------

// The old check glued a deep link's path onto SITE_URL and compared prefixes.
for (const evil of [".evil.tld/", ".evil.tld", "@evil.tld/", "@evil.tld", ":@evil.tld/", "evil.tld", "//evil.tld/", "//evil.tld", "///evil.tld"]) {
  assert.equal(kind(evil), "refused", `path ${JSON.stringify(evil)} is refused`);
}
// Absolute links that only start like the portal.
assert.deepEqual(target("https://sjabrankamran.com.evil.tld/"), { kind: "external", url: "https://sjabrankamran.com.evil.tld/", host: "sjabrankamran.com.evil.tld" });
for (const evil of [
  "https://sjabrankamran.com@evil.tld/",
  "https://sjabrankamran.com:443@evil.tld/",
  "https://user:pass@sjabrankamran.com/portal",
  "https://evil.tld\\@sjabrankamran.com/",
  "https://evil.tld\\.sjabrankamran.com/",
  "https://sjabrankamran.com\t.evil.tld/",
  "https://sjabrankamran.com\n@evil.tld/",
  "https:sjabrankamran.com/portal",
  "https:/sjabrankamran.com/portal",
  "https:///sjabrankamran.com/portal",
  "https://[::1]/",
  "https://sjabrankamran%2ecom/",
  "https://sjabrankamran.com:99999/",
  "https://sjabrankamran.com:0/",
  " https://sjabrankamran.com/portal",
  "/portal\\..\\..\\evil",
  "/portal/\u0000",
]) {
  assert.equal(kind(evil), "refused", `${JSON.stringify(evil)} is refused`);
}
for (const scheme of ["javascript:alert(1)", "JavaScript:alert(document.cookie)", "data:text/html,<script>1</script>", "file:///etc/passwd", "intent://x#Intent;end", "sjkportal://web?path=/portal", "about:blank", "blob:https://sjabrankamran.com/x"]) {
  assert.equal(kind(scheme), "refused", `${scheme} is refused`);
}
for (const junk of [undefined, null, 42, ["/portal"], {}, "", "x".repeat(5000)]) {
  assert.equal(kind(junk), "refused", `${typeof junk} is refused`);
}
// External targets carry only what was written, and never userinfo.
assert.deepEqual(target("https://drive.google.com/file/d/abc/view?usp=sharing"), {
  kind: "external", url: "https://drive.google.com/file/d/abc/view?usp=sharing", host: "drive.google.com",
});
assert.equal(target("https://uiqugjlpkbzpujrisfgg.supabase.co/storage/v1/object/sign/a.pdf?token=t").kind, "external");
assert.equal(parseHttpUrl("https://a.b:443/x").origin.port, "", "default port dropped");
assert.ok(sameOrigin(parseHttpUrl("https://SJABRANKAMRAN.com/").origin, SITE));
assert.equal(normalisePath("portal"), null, "not a path from the root");

// --- navigations inside the signed-in WebView -------------------------------------------------

const decide = (url, top = true) => navigationDecision(url, top, SITE);
assert.equal(decide(`${PORTAL}/portal/exam-lab`), "load");
assert.equal(decide(`${PORTAL}/lab/lab-room/`), "load");
assert.equal(decide("https://sjabrankamran.com.evil.tld/"), "hand-off", "another site goes to the phone's browser, never loads here");
assert.equal(decide("https://www.youtube.com/watch?v=x"), "hand-off");
assert.equal(decide("https://sjabrankamran.com@evil.tld/"), "block");
assert.equal(decide("javascript:alert(1)"), "block");
assert.equal(decide("intent://scan/#Intent;scheme=zxing;end"), "block");
assert.equal(decide("data:text/html,hi"), "block");
assert.equal(decide("mailto:physics@sjabrankamran.com"), "hand-off");
assert.equal(decide("tel:+923000000000"), "hand-off");
assert.equal(decide("about:blank"), "load");
assert.equal(decide(`blob:${PORTAL}/5d1c`), "load", "a download the portal page made");
assert.equal(decide("blob:https://evil.tld/5d1c"), "block");
assert.equal(decide("https://www.youtube.com/embed/x", false), "load", "a frame inside a portal page (the engine scopes its cookies)");
assert.equal(decide("https://drive.google.com/file/d/x/preview", false), "load");

// --- the session in the WebView -----------------------------------------------------------------

const pairs = [["sb-ref-auth-token", "base64-eyJhIjoxfQ"], ["bad;name", "x"], ["ok", "bad value"]];
assert.equal(cookieHeader([...pairs, ["portal_client", "app"]]), "sb-ref-auth-token=base64-eyJhIjoxfQ; portal_client=app", "only well-formed pairs");
const script = sessionCookieScript(SITE, [["sb-ref-auth-token", "base64-eyJhIjoxfQ", 3600], ["portal_client", "app", 31536000]]);
assert.ok(!/domain=/i.test(script), "host-only cookies: never sent to another subdomain");
assert.ok(script.includes("Secure"), "https portal: Secure");
assert.ok(!sessionCookieScript(parseOrigin("http://192.168.1.20:3000"), [["a", "b", 60]]).includes("Secure"), "a local http dev server can't take Secure cookies");

// Run the script against fake pages: it writes only on the portal's exact origin.
function run(src, loc) {
  const written = [];
  const document = {};
  Object.defineProperty(document, "cookie", { set: (v) => written.push(v), get: () => "" });
  const result = vm.runInNewContext(src, { location: loc, document });
  assert.equal(result, true, "the script evaluates to true (react-native-webview expects it)");
  return written;
}
const page = (protocol, hostname, port = "") => ({ protocol, hostname, port });
assert.deepEqual(run(script, page("https:", "sjabrankamran.com")), [
  "sb-ref-auth-token=base64-eyJhIjoxfQ; path=/; max-age=3600; SameSite=Lax; Secure",
  "portal_client=app; path=/; max-age=31536000; SameSite=Lax; Secure",
]);
for (const foreign of [
  page("https:", "sjabrankamran.com.evil.tld"), page("https:", "evil.tld"), page("https:", "www.sjabrankamran.com"),
  page("http:", "sjabrankamran.com"), page("https:", "sjabrankamran.com", "8443"), page("about:", ""),
]) {
  assert.deepEqual(run(script, foreign), [], `nothing written on ${foreign.protocol}//${foreign.hostname}:${foreign.port}`);
}
// A value that could break out of the script's string never reaches it.
const hostile = sessionCookieScript(SITE, [["x", "a\";alert(1);//", 60], ["y", "</script>", 60], ["z", "ok", -1]]);
assert.deepEqual(run(hostile, page("https:", "sjabrankamran.com")), []);

console.log("mobile web targets: all tests passed");
