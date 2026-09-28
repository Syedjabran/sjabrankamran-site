// Fails if any "use client" module can reach the Exam Lab answer key or the
// Practical Lab's server engine.
//
// The Exam Lab twin of check-sat-client-imports.mjs (same import-graph walk,
// walkClientImports): anything a client module imports is bundled for the
// browser, so no "use client" file may reach, directly or through any chain
// of imports, a module in src/lib/exam-lab/ that holds answers, mark-scheme
// paths, the staff-written secure bank or the server's signing keys:
//
//   image-bank.ts, image-bank-olevel.ts, bank-all.ts   9702 / 5054 / secure image banks
//   bank.ts, bank-olevel.ts, pastpaper-bank.ts         text banks with `ans` + `scheme`
//   generate.ts, drill-records.ts, sittings.ts,        server logic over those banks
//   catalog.ts, keys.ts
//   any src/lib/exam-lab/*.json                        the bank data itself
//
// nor ANY file under src/lib/practical-lab/ (final fix wave, M5): the lab's
// physics runs on the server behind /api/lab -- engine.mjs, experiments.mjs,
// measurement.mjs, the models/*.mjs (each with its ideal-answer helpers),
// and the attempt signing / per-attempt hidden values (attempt.ts,
// params.ts, lab-api.ts, from LAB_SECRET). The .mjs files can't carry
// `import "server-only"`, so this walk is what keeps them out of the browser.
//
// Client code gets questions from /api/exam-lab/sitting (paper-meta.ts
// SafeQuestion) and the hub's paper list from the server page (catalog.ts);
// the lab room gets readings from /api/lab/*.
// Runs a self-test against a generated fixture first, so a walker that finds
// nothing because it is broken fails too.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkClientImports } from "./check-sat-client-imports.mjs";

// Paths relative to src/lib/exam-lab/.
const FORBIDDEN = new Set([
  "image-bank.ts", "image-bank-olevel.ts", "bank-all.ts", "bank.ts", "bank-olevel.ts", "pastpaper-bank.ts",
  "generate.ts", "drill-records.ts", "sittings.ts", "catalog.ts", "keys.ts",
]);

/** `file` relative to `dir` ("a/b.ts"), or null when it isn't under `dir`. */
function under(dir, file) {
  const rel = path.relative(dir, file).split(path.sep).join("/");
  return !rel || rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
}

function isForbidden(file, srcDir) {
  if (under(path.join(srcDir, "lib", "practical-lab"), file) !== null) return true; // the whole lab engine
  const dir = path.join(srcDir, "lib", "exam-lab");
  const rel = under(dir, file);
  if (rel === null) return false;
  return FORBIDDEN.has(rel) || (path.dirname(file) === dir && rel.endsWith(".json"));
}

export function findExamLabViolations(srcDir) {
  return walkClientImports(srcDir, isForbidden);
}

function selfTest() {
  const root = mkdtempSync(path.join(os.tmpdir(), "exam-lab-client-imports-"));
  const src = path.join(root, "src");
  const put = (rel, text) => {
    const file = path.join(src, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  try {
    put("lib/exam-lab/image-bank.json", "[]\n");
    put("lib/exam-lab/secure-bank.json", "[]\n");
    put("lib/exam-lab/image-bank.ts", 'import raw from "./image-bank.json";\nimport sec from "./secure-bank.json";\nexport const IMAGE_BANK = [...raw, ...sec];\n');
    put("lib/exam-lab/bank-all.ts", 'import { IMAGE_BANK } from "./image-bank";\nexport const ALL = IMAGE_BANK;\n');
    put("lib/exam-lab/paper-meta.ts", "export type SafeQuestion = { id: string };\nexport const CANON = 1;\n");
    put("lib/exam-lab/topics.ts", "export const TOPICS = { AS: [] };\n");
    put("lib/exam-lab/bank.ts", 'export { TOPICS } from "./topics";\nexport const BANK = [{ ans: 1 }];\n');
    put("lib/portal/util.ts", 'export { ALL } from "../exam-lab/bank-all";\n');
    put("components/ok.tsx", '"use client";\nimport { CANON } from "@/lib/exam-lab/paper-meta";\nimport type { ALL } from "@/lib/exam-lab/bank-all";\nimport { TOPICS } from "@/lib/exam-lab/topics";\nexport const ok = [CANON, TOPICS];\n');
    put("components/hub.tsx", '"use client";\nimport { IMAGE_BANK } from "@/lib/exam-lab/image-bank";\nexport const h = IMAGE_BANK;\n');
    put("components/chain.tsx", '"use client";\nimport { ALL } from "../lib/portal/util";\nexport const c = ALL;\n');
    put("components/topics-via-bank.tsx", '"use client";\nimport { TOPICS } from "@/lib/exam-lab/bank";\nexport const t = TOPICS;\n');
    put("components/json.tsx", "'use client';\nimport data from \"@/lib/exam-lab/secure-bank.json\";\nexport const j = data;\n");
    put("components/lazy.tsx", '"use client";\nexport const load = () => import("@/lib/exam-lab/bank-all");\n');
    put("app/page.tsx", 'import { ALL } from "@/lib/exam-lab/bank-all";\nexport const p = ALL;\n');
    // The Practical Lab engine: .mjs models behind the server routes, and a pure access module beside it.
    put("lib/practical-lab/models/pendulum.mjs", "export const ideal = () => 1.235;\n");
    put("lib/practical-lab/engine.mjs", 'import { ideal } from "./models/pendulum.mjs";\nexport const viewAt = () => ideal();\n');
    put("lib/practical-lab/engine.d.mts", "export declare const viewAt: () => number;\n");
    put("lib/practical-lab/params.ts", "export const hidden = (secret: string) => secret.length;\n");
    put("lib/portal/practical-lab-access.ts", 'export const PRACTICAL_LAB_PAGE = "/portal/practical-lab";\n');
    put("lib/portal/lab-util.ts", 'export { ideal } from "../practical-lab/models/pendulum.mjs";\n');
    put("app/api/lab/view/route.ts", 'import { viewAt } from "@/lib/practical-lab/engine.mjs";\nexport const GET = () => viewAt();\n');
    put("components/lab-ok.tsx", '"use client";\nimport type { viewAt } from "@/lib/practical-lab/engine.mjs";\nimport { PRACTICAL_LAB_PAGE } from "@/lib/portal/practical-lab-access";\nexport const ok = PRACTICAL_LAB_PAGE;\n');
    put("components/lab-room.tsx", '"use client";\nimport { viewAt } from "@/lib/practical-lab/engine.mjs";\nexport const v = viewAt;\n');
    put("components/lab-chain.tsx", '"use client";\nimport { ideal } from "../lib/portal/lab-util";\nexport const i = ideal;\n');
    put("components/lab-secret.tsx", '"use client";\nexport const load = () => import("@/lib/practical-lab/params");\n');
    const { clients, violations } = findExamLabViolations(src);
    const got = violations.map((v) => v.join(" -> ")).sort();
    const want = [
      "components/chain.tsx -> lib/portal/util.ts -> lib/exam-lab/bank-all.ts",
      "components/hub.tsx -> lib/exam-lab/image-bank.ts",
      "components/json.tsx -> lib/exam-lab/secure-bank.json",
      "components/lab-chain.tsx -> lib/portal/lab-util.ts -> lib/practical-lab/models/pendulum.mjs",
      "components/lab-room.tsx -> lib/practical-lab/engine.mjs",
      "components/lab-secret.tsx -> lib/practical-lab/params.ts",
      "components/lazy.tsx -> lib/exam-lab/bank-all.ts",
      "components/topics-via-bank.tsx -> lib/exam-lab/bank.ts",
    ];
    if (clients !== 10 || JSON.stringify(got) !== JSON.stringify(want)) {
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
  const { clients, violations } = findExamLabViolations(srcDir);
  if (violations.length) {
    console.error(`${violations.length} "use client" import path(s) reach the Exam Lab answer key or the Practical Lab engine:`);
    for (const chain of violations) console.error(`  ${chain.join(" -> ")}`);
    process.exit(1);
  }
  console.log(`exam-lab-client-imports check passed (${clients} "use client" files)`);
}
