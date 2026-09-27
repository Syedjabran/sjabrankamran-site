// Fails if any "use client" module can reach the Exam Lab answer key.
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
// Client code gets questions from /api/exam-lab/sitting (paper-meta.ts
// SafeQuestion) and the hub's paper list from the server page (catalog.ts).
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

function isForbidden(file, srcDir) {
  const dir = path.join(srcDir, "lib", "exam-lab");
  const rel = path.relative(dir, file).split(path.sep).join("/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
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
    const { clients, violations } = findExamLabViolations(src);
    const got = violations.map((v) => v.join(" -> ")).sort();
    const want = [
      "components/chain.tsx -> lib/portal/util.ts -> lib/exam-lab/bank-all.ts",
      "components/hub.tsx -> lib/exam-lab/image-bank.ts",
      "components/json.tsx -> lib/exam-lab/secure-bank.json",
      "components/lazy.tsx -> lib/exam-lab/bank-all.ts",
      "components/topics-via-bank.tsx -> lib/exam-lab/bank.ts",
    ];
    if (clients !== 6 || JSON.stringify(got) !== JSON.stringify(want)) {
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
    console.error(`${violations.length} "use client" import path(s) reach the Exam Lab answer key:`);
    for (const chain of violations) console.error(`  ${chain.join(" -> ")}`);
    process.exit(1);
  }
  console.log(`exam-lab-client-imports check passed (${clients} "use client" files)`);
}
