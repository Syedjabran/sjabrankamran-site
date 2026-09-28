import assert from "node:assert/strict";
import { logoutRequest, signOutInOrder } from "../src/auth/sign-out.ts";

// Signing out leaves nothing of the account on the phone (src/auth/sign-out.ts):
// the session in memory, the data cache, the stored tokens, and -- in the
// background, never waited for -- the session on the server.
// Run: `npm test` here, or the site's `npm run test:portal`.

const SESSION = { access_token: "access-1", refresh_token: "refresh-1" };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function recorder({ clearStored, revoke } = {}) {
  const calls = [];
  const steps = {
    forget: () => calls.push("forget"),
    clearCache: () => calls.push("clearCache"),
    clearStored: async () => {
      calls.push("clearStored");
      if (clearStored) await clearStored();
    },
    revoke: async (session) => {
      calls.push(`revoke:${session.access_token}`);
      if (revoke) await revoke(session);
    },
  };
  return { calls, steps };
}

// Every step, in order: memory, cache, stored tokens, then the server.
{
  const { calls, steps } = recorder();
  await signOutInOrder(SESSION, steps);
  await tick();
  assert.deepEqual(calls, ["forget", "clearCache", "clearStored", "revoke:access-1"]);
}

// Sign-out never waits on the network: it has finished while the revoke hangs.
{
  let release;
  const { calls, steps } = recorder({ revoke: () => new Promise((resolve) => { release = resolve; }) });
  let done = false;
  const out = signOutInOrder(SESSION, steps).then(() => { done = true; });
  await out;
  assert.equal(done, true, "signed out before the server answered");
  await tick();
  assert.deepEqual(calls, ["forget", "clearCache", "clearStored", "revoke:access-1"]);
  release();
}

// A failing revoke (offline, 401, a throw) never surfaces and never undoes anything.
for (const revoke of [() => Promise.reject(new Error("offline")), () => { throw new Error("sync throw"); }]) {
  const { calls, steps } = recorder({ revoke });
  await assert.doesNotReject(signOutInOrder(SESSION, steps));
  await tick();
  assert.deepEqual(calls, ["forget", "clearCache", "clearStored", "revoke:access-1"]);
}

// Stored tokens that can't be deleted still leave the app signed out, and the server session is still ended.
{
  const { calls, steps } = recorder({ clearStored: () => Promise.reject(new Error("keystore")) });
  await assert.doesNotReject(signOutInOrder(SESSION, steps));
  await tick();
  assert.deepEqual(calls, ["forget", "clearCache", "clearStored", "revoke:access-1"]);
}

// No session (a refresh that failed, a second sign-out): everything is cleared, nothing to revoke.
{
  const { calls, steps } = recorder();
  await signOutInOrder(null, steps);
  await tick();
  assert.deepEqual(calls, ["forget", "clearCache", "clearStored"]);
}

// The server call: this device's session only (the user's browser stays signed in).
assert.deepEqual(logoutRequest("https://ref.supabase.co/", "anon-key", "access-1"), {
  url: "https://ref.supabase.co/auth/v1/logout?scope=local",
  init: { method: "POST", headers: { apikey: "anon-key", Authorization: "Bearer access-1" } },
});

console.log("mobile sign-out: all tests passed");
