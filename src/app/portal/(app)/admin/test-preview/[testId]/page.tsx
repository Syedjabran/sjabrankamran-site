import { notFound, redirect } from "next/navigation";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_BANK, SECURE_BANK } from "@/lib/exam-lab/image-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test question preview" };

type TestPreview = {
  title: string;
  slot: string;
  count: number;
  summary: string;
  prefix?: string;
  ids?: string[];
};

const LACAS_PQU_TOPICAL_IDS = [
  // Estimation (2)
  "pp-p1-9702_s21_11-q1",
  "pp-p1-9702_w24_11-q4",
  // Unit conversion (3)
  "pp-p1-9702_w22_13-q1",
  "pp-p1-9702_w23_12-q1",
  "pp-p1-9702_s24_12-q8",
  // SI base units, dimensions and homogeneity (10)
  "pp-p1-9702_w18_11-q2",
  "pp-p1-9702_w18_12-q2",
  "pp-p1-9702_m19_12-q2",
  "pp-p1-9702_s19_12-q3",
  "pp-p1-9702_w21_11-q2",
  "pp-p1-9702_s22_11-q2",
  "pp-p1-9702_w22_13-q2",
  "pp-p1-9702_s23_13-q2",
  "pp-p1-9702_m24_12-q3",
  "pp-p1-9702_w24_11-q1",
  // Uncertainties, errors and graphs (10)
  "pp-p1-9702_s18_11-q5",
  "pp-p1-9702_s18_12-q4",
  "pp-p1-9702_s18_13-q4",
  "pp-p1-9702_w18_11-q5",
  "pp-p1-9702_w18_13-q5",
  "pp-p1-9702_s19_12-q5",
  "pp-p1-9702_s19_12-q6",
  "pp-p1-9702_s19_12-q7",
  "pp-p1-9702_s19_13-q6",
  "pp-p1-9702_w21_11-q5",
] as const;

const TESTS: Record<string, TestPreview> = {
  "ct1-lacas-sep11-7pm": {
    title: "CAIE 9702 Class Test 1 · Physical Quantities & Units",
    slot: "LACAS JT · 11 September 2026 · 7:00 pm PKT",
    prefix: "9702_ct1_pqu-",
    count: 20,
    summary: "20 MCQs · 20 marks · 30 minutes · 7 LOT, 8 MOT, 5 HOT",
  },
  "ct1-lgs55-sep11-9pm": {
    title: "CAIE 9702 Class Test 2 · Physical Quantities & Units",
    slot: "LGS 55 Main · 11 September 2026 · 9:00 pm PKT",
    prefix: "9702_ct1_pqu-",
    count: 20,
    summary: "20 MCQs · 20 marks · 30 minutes · 7 LOT, 8 MOT, 5 HOT",
  },
  "lacas-a1-pqu-drill-sep2026": {
    title: "LACAS A1 · Physical Quantities Class Drill",
    slot: "Year 1 · G1 and G2 · review draft (not assigned)",
    ids: [...LACAS_PQU_TOPICAL_IDS],
    count: 25,
    summary: "25 MCQs selected from the Exam Lab P1 topical bank · 25 marks · 35 minutes",
  },
};

export default async function TestPreviewPage({ params }: { params: Promise<{ testId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/portal/login");
  if (!isSuperAdmin(admin)) redirect("/portal");

  const { testId } = await params;
  const meta = TESTS[testId];
  if (!meta) notFound();

  const questions = meta.ids
    ? meta.ids.map((id) => IMAGE_BANK.find((q) => q.id === id)).filter((q) => q !== undefined)
    : [...SECURE_BANK].filter((q) => q.id.startsWith(meta.prefix || "")).sort((a, b) => a.qnum - b.qnum);
  if (questions.length !== meta.count) notFound();

  const paths = questions.map((q) => q.img);
  const { data } = await createAdminClient().storage.from("exam-assets").createSignedUrls(paths, 3600);
  const urls = new Map((data || []).filter((item) => item.path && item.signedUrl).map((item) => [item.path, item.signedUrl as string]));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">Super-admin Exam Lab drill preview</p>
        <h1 className="mt-2 text-2xl font-semibold text-ice">{meta.title}</h1>
        <p className="mt-1 text-sm text-fog">{meta.slot}</p>
        <p className="mt-3 text-xs text-dust">{meta.summary}. Review only; the drill has not been assigned to students.</p>
      </header>

      <div className="space-y-5">
        {questions.map((q, index) => (
          <article key={q.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ice">Question {index + 1}</p>
              <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
                <span className="rounded-full border border-cyan/30 px-2 py-1 text-cyan">{q.level}</span>
                <span className="rounded-full border border-white/10 px-2 py-1 text-dust">{q.ref}</span>
                <span className="rounded-full border border-white/10 px-2 py-1 text-dust">Answer {q.answer}</span>
              </div>
            </div>
            {urls.get(q.img) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls.get(q.img)} alt={`Question ${index + 1}`} className="w-full rounded-xl border border-white/10 bg-white" />
            ) : <p className="text-sm text-signal">Question image unavailable.</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
