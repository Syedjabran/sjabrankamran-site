import { PortalSearchClient } from "./search-client";

export const metadata = { title: "Search", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PortalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ice">Search</h1>
      <PortalSearchClient initialQuery={(q || "").slice(0, 80)} />
    </div>
  );
}
