import ReactMarkdown from "react-markdown";
import { latexToUnicode } from "@/lib/ai/format";

/**
 * AI answers must reach students as normal readable text with real symbols
 * (g = F / m, 6.67 × 10⁻¹¹ N m² kg⁻²) — never raw LaTeX source. New answers
 * are generated LaTeX-free at the prompt + sanitised server-side; this
 * render-time pass repairs OLDER answers already stored with $...$ / \frac
 * markup without changing their source text in the database.
 */
export function normalizePhysicsMath(content: string) {
  return latexToUnicode(content).replace(/\n{3,}/g, "\n\n");
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h2 className="mb-3 mt-5 text-xl font-semibold text-ice">{children}</h2>,
        h2: ({ children }) => <h3 className="mb-3 mt-5 text-lg font-semibold text-ice">{children}</h3>,
        h3: ({ children }) => <h4 className="mb-2 mt-4 font-semibold text-ice">{children}</h4>,
        p: ({ children }) => <p className="my-3 leading-7 text-fog">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-5 text-fog">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-5 text-fog">{children}</ol>,
        li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-ice">{children}</strong>,
        code: ({ children }) => (
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-cyan">{children}</code>
        ),
      }}
    >
      {normalizePhysicsMath(content)}
    </ReactMarkdown>
  );
}
