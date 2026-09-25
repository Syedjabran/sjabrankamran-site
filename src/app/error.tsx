"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Section } from "@/components/ui/section";

/**
 * Route-level error boundary: any server or render error below the root
 * layout lands here instead of Next's default error screen.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error", error.digest ?? error.message);
  }, [error]);

  return (
    <Section tone="void">
      <div className="mx-auto flex max-w-xl flex-col items-center py-10 text-center">
        <p className="eyebrow mb-4">Something went wrong</p>
        <h1 className="text-3xl font-semibold leading-tight text-ice md:text-4xl">
          This page hit an unexpected snag.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-fog">
          It&rsquo;s on our side, not yours. Please try again — if it keeps happening, come back in a few minutes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            <RotateCcw size={16} /> Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back to home
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widelabel text-dust">Reference {error.digest}</p>
        ) : null}
      </div>
    </Section>
  );
}
