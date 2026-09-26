import Link from "next/link";
import { MessagesSquare } from "lucide-react";

/** Opens the SAT tutor on "explain my mistake" for one finished question
 *  (score report, drill review, Progress). The tutor checks on the server
 *  that the question is finished by this student before explaining it. */
export function ExplainLink({ questionId, label = "Explain my mistake" }: { questionId: string; label?: string }) {
  return (
    <Link href={`/portal/sat-lab/tutor?explain=${encodeURIComponent(questionId)}`} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
      <MessagesSquare size={14} /> {label}
    </Link>
  );
}
