import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { PageHero } from "@/components/page-hero";
import { Section } from "@/components/ui/section";
import { GraduationCap, Building2, Cpu } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact Syed Jabran Ali Kamran — student and parent physics enquiries, academic collaboration, consulting, partnerships, speaking, and technology.",
};

const PATHS = [
  { icon: GraduationCap, tone: "text-cyan border-cyan/30", title: "Education", items: ["Student physics questions", "Parents & mentoring", "Schools & masterclasses", "University guidance"] },
  { icon: Building2, tone: "text-emerald2 border-emerald2/30", title: "Corporate", items: ["Strategic advisory", "Industrial consulting", "Training", "Venture collaboration"] },
  { icon: Cpu, tone: "text-magenta border-magenta/30", title: "Technology", items: ["AI consultation", "CRM / enterprise systems", "Workflow automation", "Technology partnership"] },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Start a conversation"
        intro="Whether you're a student with a physics question, a school, a business, or a technology partner — choose the enquiry type that fits and I'll respond personally."
      />
      <Section tone="void">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-5">
            {PATHS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="card p-5">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-lg border ${p.tone}`}>
                      <Icon size={16} />
                    </span>
                    <p className="font-display text-base font-semibold text-ice">{p.title}</p>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fog">
                    {p.items.map((it) => <li key={it}>· {it}</li>)}
                  </ul>
                </div>
              );
            })}
            <p className="text-xs leading-relaxed text-dust">
              Your information is used only to assess and respond to your enquiry. It is stored securely
              and never shared. Students: for physics help, you can also use{" "}
              <a href="/physics-studio" className="text-cyan hover:underline">Physics Studio</a>.
            </p>
          </div>
          <ContactForm />
        </div>
      </Section>
    </>
  );
}
