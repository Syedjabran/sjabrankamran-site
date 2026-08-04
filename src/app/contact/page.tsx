import { ContactForm } from "@/components/contact-form";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
export const metadata={title:"Contact",description:"Contact Syed Jabran Ali Kamran for consulting, education, speaking, partnerships, and technology collaboration."};
export default function ContactPage(){return <><PageHero eyebrow="Contact" title="Start a serious conversation." intro="For consulting, partnerships, speaking, education, technology collaboration, or media enquiries, use the form below."/><Section tone="light"><div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]"><div><p className="eyebrow">Enquiries</p><h2 className="mt-4 text-3xl text-ink">Tell me what you are working on.</h2><p className="mt-5 leading-7 text-secondary">Share the context, objective, and relevant timeframe. Your information will be used only to assess and respond to your enquiry.</p></div><ContactForm/></div></Section></>}
