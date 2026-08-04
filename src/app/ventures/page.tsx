import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { ventures } from "@/content/site-data";

export const metadata = { title: "Ventures", description: "Selected ventures founded and led by Syed Jabran Ali Kamran." };
export default function VenturesPage() { return <><PageHero eyebrow="Ventures" title="Institutions built around useful work." intro="A selected view of current businesses and platforms. Roles marked as pending verification are withheld from definitive publication until confirmed."/><Section tone="light"><div className="grid gap-px overflow-hidden border border-stone bg-stone md:grid-cols-2">{ventures.map(v => <article key={v.slug} className="bg-ivory p-8 md:p-10"><p className="eyebrow">{v.sector}</p><h2 className="mt-4 text-3xl text-ink">{v.name}</h2><p className="mt-2 text-sm text-secondary">{v.roleUnverified ? "Leadership role — wording under verification" : v.role} · {v.geography}</p><p className="mt-6 leading-7 text-secondary">{v.summary}</p>{v.url && <Link className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-copper" href={v.url} target="_blank">Visit organisation <ArrowUpRight size={16}/></Link>}</article>)}</div></Section></> }
