/**
 * Anonymous leaderboard identity — each user's "conspicuous code". SERVER-ONLY.
 *
 * Every user is given a stable, unique call-sign derived deterministically from
 * their user id — e.g. "Cobalt Falcon A7F3". On the student leaderboard others
 * see ONLY this code, never a real name, so students stay anonymous UNLESS they
 * opt in to show their real name. The same code is shown to each user in their
 * own profile (Settings) so they always know their handle.
 *
 * The code needs no storage: it is a pure function of the user id, so it is the
 * same forever and can never leak an identity. Only the opt-in "show my real
 * name" preferences are persisted — as one small JSON map in the private
 * `portal-data` bucket (Storage-as-DB, no schema migration).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTAL_BUCKET } from "@/lib/portal/onboarding";

// FNV-1a 32-bit — small, stable, dependency-free string hash.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Cosmic / physics-flavoured word banks (64 each) — on-brand and eye-catching
// ("conspicuous"). Do NOT reorder or trim: the index into these lists is what
// makes a user's code STABLE across time. Appending is safe; editing/removing
// existing entries would reshuffle everyone's code.
const ADJECTIVES = [
  "Cobalt", "Crimson", "Golden", "Silver", "Azure", "Amber", "Violet", "Emerald",
  "Scarlet", "Cosmic", "Stellar", "Lunar", "Solar", "Astral", "Quantum", "Radiant",
  "Ionic", "Atomic", "Plasmic", "Kinetic", "Electric", "Magnetic", "Orbital", "Nebular",
  "Galactic", "Celestial", "Polar", "Prismatic", "Titanium", "Platinum", "Obsidian", "Sapphire",
  "Ruby", "Onyx", "Jade", "Coral", "Bronze", "Copper", "Iron", "Steel",
  "Frost", "Ember", "Blazing", "Shining", "Swift", "Bright", "Bold", "Noble",
  "Regal", "Mighty", "Rapid", "Vivid", "Lucid", "Sonic", "Turbo", "Hyper",
  "Ultra", "Mega", "Prime", "Apex", "Nova", "Astro", "Zephyr", "Vortex",
];
const NOUNS = [
  "Falcon", "Phoenix", "Comet", "Meteor", "Quasar", "Pulsar", "Nebula", "Electron",
  "Proton", "Neutron", "Quark", "Boson", "Lepton", "Graviton", "Photon", "Muon",
  "Gluon", "Fermion", "Hadron", "Ion", "Nucleus", "Orbit", "Vector", "Tensor",
  "Matrix", "Prism", "Vertex", "Helix", "Cortex", "Zenith", "Horizon", "Eclipse",
  "Aurora", "Cosmos", "Galaxy", "Nova", "Solaris", "Sunfire", "Lyra", "Orion",
  "Vega", "Sirius", "Rigel", "Antares", "Draco", "Corvus", "Hydra", "Aquila",
  "Pegasus", "Griffin", "Kestrel", "Osprey", "Raven", "Panther", "Jaguar", "Cobra",
  "Viper", "Mantis", "Sabre", "Talon", "Wraith", "Titan", "Nimbus", "Specter",
];

/**
 * Deterministic, stable, effectively-unique call-sign for a user id.
 * Same uid → same code forever, with no storage needed.
 * Shape: "<Adjective> <Noun> <4-hex>" → 64 × 64 × 65 536 ≈ 268M combinations.
 */
export function aliasFor(uid: string): string {
  const adj = ADJECTIVES[fnv1a("adj:" + uid) % ADJECTIVES.length];
  const noun = NOUNS[fnv1a("noun:" + uid) % NOUNS.length];
  const suffix = (fnv1a("sfx:" + uid) % 0x10000).toString(16).toUpperCase().padStart(4, "0");
  return `${adj} ${noun} ${suffix}`;
}

// --- Opt-in "show my real name" preferences (Storage-as-DB) -----------------

const REVEAL_KEY = "leaderboard/reveals.json";
type RevealMap = Record<string, boolean>;

let _revealCache: { at: number; set: Set<string> } | null = null;

async function readRevealMap(): Promise<RevealMap> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(PORTAL_BUCKET).download(REVEAL_KEY);
    if (error || !data) return {};
    return JSON.parse(await data.text()) as RevealMap;
  } catch {
    return {};
  }
}

async function writeRevealMap(map: RevealMap): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const body = new Blob([JSON.stringify(map)], { type: "application/json" });
    const { error } = await supabase.storage
      .from(PORTAL_BUCKET)
      .upload(REVEAL_KEY, body, { upsert: true, contentType: "application/json" });
    return !error;
  } catch {
    return false;
  }
}

/** Cached set of user ids who chose to show their real name on the leaderboard. */
export async function getRevealSet(ttlMs = 60_000): Promise<Set<string>> {
  if (_revealCache && Date.now() - _revealCache.at < ttlMs) return _revealCache.set;
  const map = await readRevealMap();
  const set = new Set(Object.keys(map).filter((k) => map[k]));
  _revealCache = { at: Date.now(), set };
  return set;
}

/** True when this user has opted to show their real name instead of their code. */
export async function isRevealed(uid: string): Promise<boolean> {
  return (await getRevealSet()).has(uid);
}

/** Set/clear one user's reveal preference; invalidates the shared cache. */
export async function setReveal(uid: string, reveal: boolean): Promise<boolean> {
  const map = await readRevealMap();
  if (reveal) map[uid] = true;
  else delete map[uid];
  const ok = await writeRevealMap(map);
  if (ok) _revealCache = null; // force refresh on next read
  return ok;
}
