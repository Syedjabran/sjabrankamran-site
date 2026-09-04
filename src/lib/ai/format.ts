/**
 * LaTeX → plain-Unicode physics text. Shared by server (sanitising fresh AI
 * answers) and client (rendering answers already stored with LaTeX).
 *
 * Why: AI tutor answers were reaching students as raw LaTeX source
 * ($$g = \frac{F}{m}$$, \mathrm{N\,kg^{-1}} …). Rather than depend on every
 * surface rendering KaTeX correctly (chat bubbles, textareas, emails,
 * copy-paste), we convert to real Unicode symbols: g = F/m, N kg⁻¹, 6.67 × 10⁻¹¹.
 */

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
};
const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
  pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ",
  Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const SYMBOLS: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", approx: "≈", sim: "~", propto: "∝",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", equiv: "≡", ll: "≪", gg: "≫",
  rightarrow: "→", to: "→", leftarrow: "←", Rightarrow: "⇒", implies: "⇒", infty: "∞",
  degree: "°", circ: "°", partial: "∂", nabla: "∇", int: "∫", sum: "Σ", prod: "Π",
  hbar: "ℏ", ohm: "Ω", angstrom: "Å", perp: "⊥", parallel: "∥", angle: "∠", therefore: "∴", because: "∵",
};

function mapChars(s: string, table: Record<string, string>): string | null {
  let out = "";
  for (const ch of s) {
    const m = table[ch];
    if (!m) return null;
    out += m;
  }
  return out;
}

/** Convert ^{...}/^x and _{...}/_x to Unicode where possible. */
function scripts(text: string): string {
  return text
    .replace(/\^\{([^{}]+)\}/g, (m, g: string) => mapChars(g, SUP) ?? `^(${g})`)
    .replace(/\^([0-9+\-−=niT])/g, (m, g: string) => mapChars(g, SUP) ?? m)
    .replace(/_\{([^{}]+)\}/g, (m, g: string) => mapChars(g, SUB) ?? `_${g}`)
    .replace(/_([0-9])/g, (m, g: string) => SUB[g] ?? m);
}

/** One simplification pass over LaTeX commands (run until stable). */
function pass(t: string): string {
  // Scripts first: converting ^{-1} → ⁻¹ removes nested braces so wrappers
  // like \mathrm{N\,kg^{-1}} can match their {...} on the next lines.
  let s = scripts(t);
  // Named functions get breathing room: BA\cos\theta → BA cos θ
  s = s.replace(/\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp)\b/g, " $1 ");
  // \frac{a}{b} → a/b (parenthesise multi-token parts)
  s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
    const num = a.trim(), den = b.trim();
    const wrap = (x: string) => (/^[\w⁰-⁹₀-₉αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ°.·×]+$/.test(x) && !/[+\-\s]/.test(x) ? x : `(${x})`);
    return `${wrap(num)}/${wrap(den)}`;
  });
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\(?:mathrm|text|mathbf|mathit|boldsymbol|mathsf|operatorname)\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\vec\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\(?:left|right|Big[lr]?|big[lr]?|Bigg[lr]?|bigg[lr]?)/g, "");
  s = s.replace(/\\(?:,|;|:|!| )/g, " ");
  s = s.replace(/\\(?:quad|qquad)/g, "  ");
  s = s.replace(/\\([A-Za-z]+)/g, (m, w: string) => GREEK[w] ?? SYMBOLS[w] ?? m);
  return s;
}

/** Full conversion: strip math delimiters, translate commands, tidy braces. */
export function latexToUnicode(input: string): string {
  if (!input) return input;
  let s = input;

  // Normalise alternate delimiters first, then remove all math delimiters —
  // the content itself gets converted to plain Unicode.
  s = s.replace(/\\\[/g, "\n").replace(/\\\]/g, "\n");
  s = s.replace(/\\\(/g, "").replace(/\\\)/g, "");
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, g: string) => `\n${g.trim()}\n`);
  s = s.replace(/\$([^$\n]+)\$/g, "$1");

  for (let i = 0; i < 5; i++) {
    const next = pass(s);
    if (next === s) break;
    s = next;
  }

  // Any stray \command that survived: drop the backslash.
  s = s.replace(/\\([A-Za-z]+)/g, "$1");
  // Unwrap simple leftover brace groups (twice for one nesting level).
  s = s.replace(/\{([^{}]*)\}/g, "$1").replace(/\{([^{}]*)\}/g, "$1");
  // Collapse leftover runs of spaces (not newlines).
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}
