// DEVELOPMENT ONLY. Serves SAT crops from the local pipeline output so the SAT
// Lab can be exercised before the live upload. 404s unless NODE_ENV is
// development AND SAT_LOCAL_CROPS=1, and still requires a signed-in user.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/edu/auth";

export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "scripts", "exam-lab", "ingest-sat", "out", "crops");
const SAFE = /^sat\/(?:rw|math|tests\/\d{1,2})\/[A-Za-z0-9_-]{1,64}\.jpg$/;

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.SAT_LOCAL_CROPS !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!(await getPortalUser())) return new NextResponse("Sign in", { status: 401 });
  const p = new URL(req.url).searchParams.get("path") || "";
  if (!SAFE.test(p)) return new NextResponse("Not found", { status: 404 });
  const file = path.join(ROOT, ...p.slice("sat/".length).split("/"));
  if (!file.startsWith(ROOT + path.sep)) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await readFile(file);
    return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
