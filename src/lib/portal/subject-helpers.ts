/**
 * Subject content for the floating AI helper (components/einstein-companion.tsx).
 * Pure and isomorphic, like the registry that points at it (subjects.ts): a
 * subject's `helper` is one of these, and the companion shows the persona of
 * the subject whose page is open (or the first subject that has one).
 *
 * Everything here is subject-specific wording by design -- the component that
 * shows it stays generic. A new subject with a helper adds one persona here
 * (and the API route it asks).
 */

export interface HelperPersona {
  /** The character's name, as screen readers hear it. */
  name: string;
  /** The ask button's and the panel's accessible name. */
  ariaLabel: string;
  /** The ask panel's heading. */
  panelTitle: string;
  /** The rotating speech-bubble lines. */
  greetings: readonly string[];
  /** Example questions a student can start from. */
  examples: readonly string[];
  /** The curriculum choices sent with a question; the first is the default. */
  curricula: readonly string[];
  /** The line above the examples. */
  intro: string;
  placeholder: string;
  /** Shown while the answer is being written. */
  thinking: string;
  /** The answer's label when the API sends none. */
  answerLabel: string;
  /** Shown when the tutor is offline and the question was kept for a teacher. */
  offline: string;
  /** The API route the helper asks. */
  endpoint: string;
  /** The two character frames that cross-fade. */
  images: readonly [string, string];
  /** The full page behind the helper. */
  fullPage: { href: string; label: string };
  /** The helper's card on My Learning. */
  card: { title: string; body: string };
}

/** Physics: Einstein, backed by the Physics Studio tutor (/api/physics-question). */
export const PHYSICS_HELPER: HelperPersona = {
  name: "Einstein",
  ariaLabel: "Ask Einstein a physics question",
  panelTitle: "Ask a physics question",
  greetings: [
    "Curious minds ask better questions.",
    "Stuck on a physics problem? Ask me.",
    "Let us turn confusion into understanding.",
    "Ready to challenge the universe?",
    "No question is too small for physics.",
    "Ask before gravity pulls your marks down.",
    "Let us calculate it together.",
  ],
  examples: [
    "Why does a satellite in a higher orbit move more slowly?",
    "A car brakes from 30 m/s to rest in 60 m. Find the deceleration.",
    "What is the difference between e.m.f. and potential difference?",
  ],
  curricula: ["A-Level", "O-Level", "IBDP", "General"],
  intro: "Ask anything from your physics course — the AI tutor explains step by step. Or start from an example:",
  placeholder: "Type your physics question…",
  thinking: "Working through the physics…",
  answerLabel: "AI Physics Tutor",
  offline: "The tutor is offline right now — your question was saved for a personal teacher review. Try the full Physics Studio to leave your email.",
  endpoint: "/api/physics-question",
  images: ["/einstein/einstein-tongue.webp", "/einstein/einstein-smile.webp"],
  fullPage: { href: "/physics-studio", label: "Physics Studio" },
  card: {
    title: "Physics Studio AI",
    body: "Stuck on a concept or a numerical? The AI tutor explains step by step with proper mathematical notation — available any time.",
  },
};
