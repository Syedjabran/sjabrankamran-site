import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { consultingCapabilities } from "@/content/site-data";
export const metadata={title:"Consulting & Advisory",description:"Strategy, operations, trade, industrial performance, AI, and corporate training."};
export default function ConsultingPage(){return <><PageHero eyebrow="Consulting & advisory" title="Strategy that survives contact with operations." intro="Advisory work connects commercial direction with the systems, people, and evidence required to execute it."/><Section tone="light"><div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">{consultingCapabilities.map((x,i)=><article key={x.title} className="border-t border-ink/20 pt-6"><span className="font-mono text-xs text-copper">0{i+1}</span><h2 className="mt-4 text-2xl text-ink">{x.title}</h2><p className="mt-4 leading-7 text-secondary">{x.body}</p></article>)}</div></Section></>}
