import Link from "next/link";
import { MessagesSquare } from "lucide-react";

/** Opens the SAT tutor on "explain my mistake" for one finished question
 *  (score report, drill review, Progress). `from`: the drill or sitting the
 *  link sits in, so the tutor explains that attempt's answer. The tutor
 *  checks on the server that the question is finished by this student. */
export function ExplainLink({ questionId, from, label = "Explain my mistake" }: { questionId: string; from?: string; label?: string }) {
  const query = `explain=${encodeURIComponent(questionId)}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
  return (
    <Link href={`/portal/sat-lab/tutor?${query}`} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
      <MessagesSquare size={14} /> {label}
    </Link>
  );
}
