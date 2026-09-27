// Fails if any "use client" module can reach the SAT answer key.
//
// Walks the import graph from every file under src/ that starts with a
// "use client" directive and fails if it reaches bank.ts, serve.ts,
// session.ts, forms.ts, adaptive.ts, scoring.ts, drills.ts, store.ts,
// analytics-data.ts, drill-start.ts or signed-images.ts in src/lib/sat/, a server-only SAT Coach module in
// src/lib/sat/coach/ (profile-store.ts, diagnostic-drill.ts, insights.ts, plan-store.ts,
// student-guard.ts, tutor.ts, parent-report.ts),
// or any src/lib/sat/*.json (the
// question bank and practice tests). Anything a client module imports is bundled for the browser, so
// this is what keeps the answer key out of it mechanically rather than by
// convention.
//
// Only `import type` / `export type` declarations are skipped (always erased).
// Every other import, re-export, side-effect import and dynamic import() is
// an edge -- conservative: an inline `{ type X }`-only import still counts.
// A "use server" module is not descended into: a client imports it as a
// server-action reference, not as code.
//
// Runs a self-test against a generated fixture first, so a walker that finds
// nothing because it is broken fails too.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Paths relative to src/lib/sat/.
const FORBIDDEN = new Set([
  "bank.ts", "serve.ts", "session.ts", "forms.ts", "adaptive.ts", "scoring.ts", "drills.ts", "store.ts",
  "analytics-data.ts", "drill-start.ts", "signed-images.ts",
  "coach/profile-store.ts", "coach/diagnostic-drill.ts", "coach/insights.ts",
  "coach/plan-store.ts", "coach/student-guard.ts", "coach/tutor.ts", "coach/parent-report.ts",
]);
// Paths relative to src/lib/ai/ — server-only (budgets, provider API keys),
// same "never reachable from a 'use client' module" rule as the SAT modules
// above, just rooted under a different directory.
const FORBIDDEN_AI = new Set(["llm.ts", "usage.ts"]);
const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

function isForbidden(file, srcDir) {
  const satDir = path.join(srcDir, "lib", "sat");
  const rel = path.relative(satDir, file).split(path.sep).join("/");
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    if (FORBIDDEN.has(rel) || (path.dirname(file) === satDir && rel.endsWith(".json"))) return true;
  }
  const aiDir = path.join(srcDir, "lib", "ai");
  const relAi = path.relative(aiDir, file).split(path.sep).join("/");
  if (relAi.startsWith("..") || path.isAbsolute(relAi)) return false;
  return FORBIDDEN_AI.has(relAi);
}

/** `@/x` and relative specifiers to a file on disk; null for a package. */
function resolveSpecifier(spec, fromFile, srcDir) {
  let base;
  if (spec.startsWith("@/")) base = path.join(srcDir, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => path.join(base, `index${e}`))];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

const parsed = new Map();
function parse(file) {
  if (!parsed.has(file)) {
    const text = readFileSync(file, "utf8");
    parsed.set(file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return parsed.get(file);
}

/** The directive prologue: "use client" / "use server" before any other statement. */
function directives(sf) {
  const out = new Set();
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
    out.add(st.expression.text);
  }
  return out;
}

/** Every module specifier this file loads at runtime. */
function runtimeImports(sf) {
  const specs = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && !node.isTypeOnly) specs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return specs;
}

/** [clientFile, ...path, forbiddenFile] for every forbidden module reachable from a client file. */
export function findViolations(srcDir) {
  parsed.clear();
  const violations = [];
  const clients = listFiles(srcDir).filter((f) => directives(parse(f)).has("use client"));
  for (const client of clients) {
    const via = new Map([[client, null]]);
    const queue = [client];
    while (queue.length) {
      const file = queue.shift();
      if (isForbidden(file, srcDir)) {
        const chain = [];
        for (let f = file; f; f = via.get(f)) chain.unshift(path.relative(srcDir, f).split(path.sep).join("/"));
        violations.push(chain);
        continue;
      }
      if (!CODE.test(file)) continue; // a .json that is not forbidden
      const sf = parse(file);
      if (file !== client && directives(sf).has("use server")) continue;
      for (const spec of runtimeImports(sf)) {
        const target = resolveSpecifier(spec, file, srcDir);
        if (target && !via.has(target)) { via.set(target, file); queue.push(target); }
      }
    }
  }
  return { clients: clients.length, violations };
}

// --- self-test on a generated fixture ---------------------------------------
function selfTest() {
  const root = mkdtempSync(path.join(os.tmpdir(), "sat-client-imports-"));
  const src = path.join(root, "src");
  const put = (rel, text) => {
    const file = path.join(src, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  try {
    put("lib/sat/client-types.ts", 'import type { X } from "./types.ts";\nexport const A = 1;\n');
    put("lib/sat/types.ts", "export type X = number;\n");
    put("lib/sat/bank.ts", 'import data from "./question-bank.json" with { type: "json" };\nexport const bank = data;\n');
    put("lib/sat/question-bank.json", "[]\n");
    put("lib/sat/drills.ts", "export const d = 1;\n");
    put("lib/sat/store.ts", "export const s = 1;\n");
    put("lib/sat/coach/profile.ts", "export const p = 1;\n");
    put("lib/sat/coach/profile-store.ts", 'import { s } from "../store.ts";\nexport const ps = s;\n');
    put("lib/util.ts", 'export { bank } from "./sat/bank";\n');
    put("lib/actions.ts", '"use server";\nimport { s } from "./sat/store";\nexport async function act() { return s; }\n');
    put("components/ok.tsx", '"use client";\nimport { A } from "@/lib/sat/client-types";\nimport type { bank } from "@/lib/sat/bank";\nimport { act } from "../lib/actions";\nexport const ok = [A, act];\n');
    put("components/reexport.tsx", '"use client";\nimport { bank } from "../lib/util";\nexport const r = bank;\n');
    put("components/json.tsx", "'use client';\nimport data from \"@/lib/sat/question-bank.json\";\nexport const j = data;\n");
    put("components/dynamic.tsx", '"use client";\nexport const load = () => import("@/lib/sat/drills");\n');
    put("components/coach-ok.tsx", '"use client";\nimport { p } from "@/lib/sat/coach/profile";\nexport const c = p;\n');
    put("components/coach-store.tsx", '"use client";\nimport { ps } from "../lib/sat/coach/profile-store";\nexport const c = ps;\n');
    put("components/server-only-page.tsx", 'import { bank } from "@/lib/sat/bank";\nexport const p = bank;\n');
    put("lib/ai/llm.ts", "export const complete = 1;\n");
    put("lib/ai/usage.ts", "export const takeBudget = 1;\n");
    put("components/ai-llm.tsx", '"use client";\nimport { complete } from "@/lib/ai/llm";\nexport const c = complete;\n');
    put("components/ai-usage.tsx", '"use client";\nimport { takeBudget } from "../lib/ai/usage";\nexport const t = takeBudget;\n');
    const { clients, violations } = findViolations(src);
    const got = violations.map((v) => v.join(" -> ")).sort();
    const want = [
      "components/ai-llm.tsx -> lib/ai/llm.ts",
      "components/ai-usage.tsx -> lib/ai/usage.ts",
      "components/coach-store.tsx -> lib/sat/coach/profile-store.ts",
      "components/dynamic.tsx -> lib/sat/drills.ts",
      "components/json.tsx -> lib/sat/question-bank.json",
      "components/reexport.tsx -> lib/util.ts -> lib/sat/bank.ts",
    ];
    if (clients !== 8 || JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`self-test failed: ${clients} client files, violations:\n  ${got.join("\n  ") || "(none)"}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  selfTest();
  const srcDir = path.resolve(fileURLToPath(new URL("../src/", import.meta.url)));
  const { clients, violations } = findViolations(srcDir);
  if (violations.length) {
    console.error(`${violations.length} "use client" import path(s) reach the SAT answer key:`);
    for (const chain of violations) console.error(`  ${chain.join(" -> ")}`);
    process.exit(1);
  }
  console.log(`sat-client-imports check passed (${clients} "use client" files)`);
}
