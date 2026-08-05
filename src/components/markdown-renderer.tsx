import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Gemini and other models often emit LaTeX with \(...\) and \[...\].
 * remark-math intentionally parses dollar delimiters, so normalise the
 * alternate LaTeX delimiters before rendering. This also repairs answers
 * already stored in Supabase without changing their source text.
 */
export function normalizePhysicsMath(content: string) {
  return content
    .replace(/\\\[/g, "\n$$\n")
    .replace(/\\\]/g, "\n$$\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\n{3,}/g, "\n\n");
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
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
