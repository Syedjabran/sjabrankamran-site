/**
 * Content model — VERIFIED facts only.
 * Education-first positioning per JB's redesign brief (2026-08-04).
 * Teaching institutions supplied and approved directly by JB.
 */

/* ------------------------------------------------------------------ */
/* POSITIONING                                                         */
/* ------------------------------------------------------------------ */

export const positioning = {
  name: "Syed Jabran Ali Kamran",
  title: "Physics Educator · Entrepreneur · AI & Technology Consultant",
  headline: "Physics first. Everything else is applied physics.",
  subhead:
    "Sixteen years teaching Cambridge Physics taught me to think in first principles — to measure before I claim, and to rebuild understanding from the ground up. That same discipline is how I now build ventures and intelligent systems.",
  hierarchy: [
    "Physics Educator & Academic Mentor",
    "Entrepreneur & Corporate Strategist",
    "Technology, IT & AI Consultant",
  ],
};

/* ------------------------------------------------------------------ */
/* THREE ECOSYSTEMS                                                    */
/* ------------------------------------------------------------------ */

export type Ecosystem = {
  key: "education" | "enterprise" | "technology";
  label: string;
  tagline: string;
  weight: string;
  href: string;
  accent: string; // tailwind text/border accent token
  body: string;
};

export const ecosystems: Ecosystem[] = [
  {
    key: "education",
    label: "Education & Physics",
    tagline: "The foundation — how I think.",
    weight: "16+ years",
    href: "/education",
    accent: "cyan",
    body: "Cambridge A-Level, O-Level and IBDP Physics. Conceptual understanding over memorisation, exam craft grounded in examiner language, and mentoring that builds independent thinkers.",
  },
  {
    key: "enterprise",
    label: "Enterprise & Ventures",
    tagline: "The build — how I create.",
    weight: "Multi-venture",
    href: "/enterprise",
    accent: "emerald",
    body: "Founding and leading ventures across Pakistan and the United Kingdom — strategic advisory, industrial performance, global trade, and institution building.",
  },
  {
    key: "technology",
    label: "AI & Technology",
    tagline: "The scale — how ideas travel.",
    weight: "AI-native",
    href: "/ai-technology",
    accent: "magenta",
    body: "AI-agent operations, multi-model orchestration, and Supabase-backed enterprise systems with human approval — technology that produces measurable business outcomes.",
  },
];

/* ------------------------------------------------------------------ */
/* EDUCATION — verified, JB-approved                                   */
/* ------------------------------------------------------------------ */

export type TeachingRole = {
  institution: string;
  curriculum: string; // A-Level / O-Level / IBDP
  status: "current" | "previous";
  logo?: string;      // official brand logo in /public/schools
  onDark?: boolean;   // white-art logo rendered directly on the dark background
  monogram?: string;  // fallback typographic monogram when no logo
};

export const currentlyTeaching: TeachingRole[] = [
  { institution: "International School Lahore (ISL)", curriculum: "A-Level Physics", status: "current", logo: "/schools/isl.jpg", onDark: true },
  { institution: "LGS 55 Main", curriculum: "A-Level Physics", status: "current", logo: "/schools/lgs.png", onDark: true },
  { institution: "LGS Paragon", curriculum: "A-Level Physics", status: "current", logo: "/schools/lgs.png", onDark: true },
  { institution: "LACAS", curriculum: "A-Level Physics", status: "current", logo: "/schools/lacas.webp" },
];

export const previousTeaching: TeachingRole[] = [
  { institution: "LGS Defence Phase V", curriculum: "A-Level", status: "previous", logo: "/schools/lgs.png", onDark: true },
  { institution: "LGS Johar Town", curriculum: "A-Level", status: "previous", logo: "/schools/lgs.png", onDark: true },
  { institution: "Roots IVY DHA Phase V", curriculum: "A-Level", status: "previous", logo: "/schools/rootsivy.jpg" },
  { institution: "Roots International Askari XI", curriculum: "A-Level", status: "previous", logo: "/schools/rootsintl.png", onDark: true },
  { institution: "The City School Ravi Campus", curriculum: "A-Level", status: "previous", logo: "/schools/cityschool.svg" },
  { institution: "LACAS Barki", curriculum: "A-Level", status: "previous", logo: "/schools/lacas.webp" },
  { institution: "Beaconhouse College Campus", curriculum: "IBDP Programme", status: "previous", logo: "/schools/beaconhouse.png" },
  { institution: "Bloomfield Hall Gulberg", curriculum: "A-Level", status: "previous", logo: "/schools/bloomfield.png" },
  { institution: "NGS Gulberg", curriculum: "A-Level", status: "previous", monogram: "NGS" },
  { institution: "Beaconhouse Garden Town", curriculum: "O-Level", status: "previous", logo: "/schools/beaconhouse.png" },
  { institution: "LACAS Johar Town", curriculum: "O-Level", status: "previous", logo: "/schools/lacas.webp" },
  { institution: "Scarsdale International School", curriculum: "O-Level", status: "previous", logo: "/schools/scarsdale.png" },
];

export const teachingCapabilities = [
  "Conceptual understanding & first principles",
  "Mathematical application in physics",
  "Practical & experimental physics",
  "Planning investigations",
  "Data & graphical analysis",
  "Error & uncertainty",
  "Past-paper analysis",
  "Mark-scheme interpretation",
  "Examiner-language exam technique",
  "University guidance & mentoring",
  "Confidence & independent learning",
  "Responsible use of AI in education",
];

export const teachingMethod = [
  { step: "Diagnose", body: "Find the conceptual gap — not just the wrong answer, but why it's wrong." },
  { step: "Rebuild", body: "Reconstruct understanding from first principles so it holds under pressure." },
  { step: "Apply", body: "Translate concepts into mathematical reasoning and real problems." },
  { step: "Practise", body: "Structured question practice mapped to the syllabus and paper style." },
  { step: "Analyse", body: "Error analysis and mark-scheme interpretation to close the marks gap." },
  { step: "Communicate", body: "Examiner-standard written answers — precise units, significant figures, clear reasoning." },
  { step: "Think Independently", body: "Develop the judgement to solve unfamiliar problems without being told how." },
];

/* ------------------------------------------------------------------ */
/* ENTERPRISE — verified ventures                                      */
/* ------------------------------------------------------------------ */

export type Venture = {
  slug: string;
  name: string;
  role: string;
  roleUnverified?: boolean;
  sector: string;
  geography: string;
  summary: string;
  contribution: string;
  url?: string;
  featured: boolean;
};

export const ventures: Venture[] = [
  {
    slug: "jabran-co",
    name: "Jabran & Co",
    role: "Founder & CEO",
    sector: "International Business & Advisory Group",
    geography: "Pakistan · United Kingdom",
    summary:
      "An international business group delivering strategic advisory, production-plant audit, global trade & sourcing, architecture & interiors, corporate training, and customs-clearance consultancy.",
    contribution:
      "Founded and lead the group; author of its evidence-based audit methodology and strategy-to-execution operating model.",
    url: "https://www.jabranandco.com",
    featured: true,
  },
  {
    slug: "eleventh-hour",
    name: "Eleventh Hour Cleaning & Maintenance Services Ltd",
    role: "Founder",
    roleUnverified: true,
    sector: "Facilities Management",
    geography: "United Kingdom",
    summary:
      "A UK facilities and maintenance company (Companies House No. 16613599) delivering professional cleaning and property-turnover services built on proof-driven quality systems.",
    contribution:
      "Founded the venture and designed its operational and quality systems for reliable, repeatable service delivery.",
    url: "https://www.eleventhhourcleaning.co.uk",
    featured: true,
  },
  {
    slug: "consultalogix",
    name: "ConsultaLogix",
    role: "Co-Founder & Managing Director",
    roleUnverified: true,
    sector: "Technology & Digital Transformation",
    geography: "United Kingdom · Pakistan",
    summary:
      "An IT and digital-transformation consultancy focused on business technology, automation, data, CRM/ERP systems, and AI integration.",
    contribution:
      "Co-founded and lead delivery of practical digital-transformation and AI-integration engagements.",
    featured: true,
  },
  {
    slug: "elevare",
    name: "Élevare Design Atelier",
    role: "Founder",
    sector: "Luxury Interiors & Architectural Surfaces",
    geography: "Pakistan",
    summary:
      "A premium interiors and architectural-surfaces brand — luxury materials, fit-out, and refined design.",
    contribution:
      "Founded the atelier and set its design language and material standards.",
    featured: true,
  },
];

/* ------------------------------------------------------------------ */
/* TECHNOLOGY — practical AI/systems work                              */
/* ------------------------------------------------------------------ */

export const techWork = [
  {
    title: "AI-Agent Operations Stack",
    body: "A self-hosted AI-agent system that runs above enterprise systems as an operations command centre — with human approval on every consequential action.",
    outcome: "Autonomous routine operations, human-controlled decisions.",
  },
  {
    title: "Multi-Model Orchestration",
    body: "A provider-independent layer routing between Claude, OpenAI and Gemini by accuracy, cost, latency and availability, with failover.",
    outcome: "Best model for each task; no single-vendor lock-in.",
  },
  {
    title: "Enterprise Business Operating System",
    body: "A Supabase-backed CRM/ERP + trade + finance + client-portal platform secured entirely by Row-Level Security.",
    outcome: "One system of record with a strict security boundary.",
  },
  {
    title: "Educational AI (Physics Studio)",
    body: "An AI physics tutor that teaches rather than answers, with every response routed through teacher review before it enters the public library.",
    outcome: "AI-assisted learning with a human educator in the loop.",
  },
  {
    title: "Approval-Controlled Automation",
    body: "Workflow automation where AI drafts and prepares, but a person approves — enquiry → structured CRM record → action.",
    outcome: "Speed of automation, safety of human judgement.",
  },
  {
    title: "Analytics & Decision Support",
    body: "Data pipelines and dashboards that turn operational data into management decisions.",
    outcome: "Evidence-based decisions, not gut feel.",
  },
];

/* ------------------------------------------------------------------ */
/* TIMELINE                                                            */
/* ------------------------------------------------------------------ */

export const timeline = [
  { year: "2009", track: "education", title: "Began teaching Physics", body: "Started a Cambridge Physics teaching career now spanning 16+ years." },
  { year: "2014", track: "enterprise", title: "Jabran & Co begins (informally)", body: "Started informally as advisory and trading work that would later become Jabran & Co." },
  { year: "2024", track: "enterprise", title: "Jabran & Co formalised", body: "Brought into formal operations as an international business & advisory group." },
  { year: "2025", track: "enterprise", title: "Eleventh Hour Cleaning Ltd (UK)", body: "Incorporated a UK facilities-management company (Companies House No. 16613599)." },
  { year: "2026", track: "enterprise", title: "Jabran & Co formally registered", body: "Jabran & Co formally registered as a firm; alongside it, deployed AI-driven CRM/ERP and a self-hosted AI-agent operations stack." },
];

export const philosophy = {
  quote: "Measure before you claim. Rebuild before you memorise.",
  body: "The through-line across teaching, building companies, and engineering systems is the same physicist's discipline: define the problem, respect the evidence, and reason from first principles to something that actually works.",
};

/* legacy exports kept for any remaining references */
export const coreAreas = ecosystems.map((e) => ({ title: e.label, body: e.body }));
export const consultingCapabilities = techWork.map((t) => ({ title: t.title, body: t.body }));
