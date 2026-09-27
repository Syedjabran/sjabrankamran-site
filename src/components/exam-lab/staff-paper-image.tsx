"use client";

import { useCallback, useState } from "react";
import { QuestionImage } from "@/components/sat/question-image";
import { signAssetPaths } from "./sign-assets";

/**
 * A stored paper's image on a STAFF page rendered on the server (the sealed
 * test preview): the URL the page was signed with (the stable, hour-long
 * cache), and -- if it fails to load -- one retry with a fresh signature
 * through /api/exam-lab/asset (staff may sign any exam image).
 */
export function StaffPaperImage({ path, url, alt }: { path: string; url: string | undefined; alt: string }) {
  const [src, setSrc] = useState(url);
  const resign = useCallback(async (): Promise<string | null> => {
    const fresh = (await signAssetPaths([path], true))[path];
    if (!fresh) return null;
    setSrc(fresh);
    return fresh;
  }, [path]);
  return <QuestionImage src={src} alt={alt} error={src ? null : "Question image unavailable."} resign={resign} lazy imgClassName="border border-white/10" />;
}
