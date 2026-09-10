import { notFound, redirect } from "next/navigation";
import { requireAdmin, isSuperAdmin } from "@/lib/portal/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SECURE_BANK } from "@/lib/exam-lab/image-bank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test question preview" };

const TESTS: Record<string, { title: string; slot: string }> = {
  "ct1-lacas-sep11-7pm": {
    title: "CAIE 9702 Class Test 1 · Physical Quantities & Units",
    slot: "LACAS JT · 11 September 2026 · 7:00 pm PKT",
  },
  "ct1-lgs55-sep11-9pm": {
    title: "CAIE 9702 Class Test 2 · Physical Quantities & Units",
    slot: "LGS 55 Main · 11 September 2026 · 9:00 pm PKT",
  },
};

export default async function TestPreviewPage({ params }: { params: Promise<{ testId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/portal/login");
  if (!isSuperAdmin(admin)) redirect("/portal");

  const { testId } = await params;
  const meta = TESTS[testId];
  if (!meta) notFound();

  const questions = [...SECURE_BANK]
    .filter((q) => q.id.startsWith("9702_ct1_pqu-"))
    .sort((a, b) => a.qnum - b.qnum);
  if (questions.length !== 20) notFound();

  const paths = questions.map((q) => q.img);
  const { data } = await createAdminClient().storage.from("exam-assets").createSignedUrls(paths, 3600);
  const urls = new Map((data || []).filter((item) => item.path && item.signedUrl).map((item) => [item.path, item.signedUrl as string]));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-cyan/20 bg-cyan/[0.04] p-5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-cyan">Super-admin sealed-paper preview</p>
        <h1 className="mt-2 text-2xl font-semibold text-ice">{meta.title}</h1>
        <p className="mt-1 text-sm text-fog">{meta.slot}</p>
        <p className="mt-3 text-xs text-dust">20 MCQs · 20 marks · 30 minutes · 7 LOT, 8 MOT, 5 HOT. Students receive these same questions in a randomized order; autocheck follows question IDs.</p>
      </header>

      <div className="space-y-5">
        {questions.map((q, index) => (
          <article key={q.id} className="rounded-2xl border border-white/10 bg-space/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ice">Question {index + 1}</p>
              <div className="flex gap-2 font-mono text-[10px] uppercase tracking-widest">
                <span className="rounded-full border border-cyan/30 px-2 py-1 text-cyan">{q.level}</span>
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
