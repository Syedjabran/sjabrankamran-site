/**
 * Seed content — VERIFIED facts only, drawn from the Discovery Report.
 * Items needing confirmation are marked `unverified: true` and are NOT rendered
 * as hard claims until JB approves. Later this data moves into Supabase.
 */

export const coreAreas = [
  {
    title: "Education",
    body: "Sixteen years teaching O/A-Level Physics — the discipline of measurement, evidence, and first principles.",
  },
  {
    title: "Strategic Advisory",
    body: "Helping owners and operators turn strategy into execution across trade, operations, and growth.",
  },
  {
    title: "Industrial Performance",
    body: "Evidence-based production plant audits and operational improvement for manufacturers.",
  },
  {
    title: "Global Trade & Sourcing",
    body: "Connecting buyers and suppliers with reliable international procurement and customs support.",
  },
  {
    title: "AI & Digital Transformation",
    body: "Architecting AI-driven enterprise systems, CRM/ERP platforms, and workflow automation.",
  },
  {
    title: "Institution Building",
    body: "Founding and structuring ventures across Pakistan and the United Kingdom.",
  },
];

export type Venture = {
  slug: string;
  name: string;
  role: string;
  roleUnverified?: boolean;
  sector: string;
  geography: string;
  summary: string;
  url?: string;
  featured: boolean;
};

export const ventures: Venture[] = [
  {
    slug: "jabran-co",
    name: "Jabran & Co",
    role: "Founder & CEO",
    sector: "International Business Group",
    geography: "Pakistan · United Kingdom",
    summary:
      "An international business group delivering strategic advisory, production plant audit, global trade and sourcing, architecture and interiors, corporate training, and customs clearance consultancy. Positioning: strategic partners, not just suppliers — where strategy meets execution.",
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
      "A UK facilities and maintenance company (Companies House No. 16613599) delivering professional cleaning and property-turnover services, built on proof-driven quality systems.",
    url: "https://www.eleventhhourcleaning.co.uk",
    featured: true,
  },
  {
    slug: "consultalogix",
    name: "Consultalogix",
    role: "Co-Founder & Managing Director",
    roleUnverified: true,
    sector: "Technology & Digital Transformation",
    geography: "United Kingdom · Pakistan",
    summary:
      "An IT and digital-transformation consultancy focused on business technology, automation, data, CRM/ERP systems, and AI integration.",
    featured: true,
  },
  {
    slug: "elevare",
    name: "Élevare Design Atelier",
    role: "Founder",
    sector: "Luxury Interiors & Architectural Surfaces",
    geography: "Pakistan",
    summary:
      "A premium interiors and architectural-surfaces brand — luxury materials, fit-out, and design in a refined black-and-gold aesthetic.",
    featured: true,
  },
];

export const consultingCapabilities = [
  { title: "Strategy & Business Development", body: "Growth strategy, market development, and turning direction into measurable results." },
  { title: "AI Transformation & Automation", body: "AI agents, workflow automation, and enterprise system architecture that improve real operations." },
  { title: "Production Plant Audit & Performance", body: "Independent, evidence-based audits of manufacturing operations, OEE, and line balancing." },
  { title: "Global Sourcing & Trade", body: "International procurement, supplier reliability, and customs clearance support." },
  { title: "Supply Chain Consultancy", body: "Process improvement, capacity planning, and operational excellence." },
  { title: "Corporate Training", body: "Leadership, AI-adoption, and business-development training for teams and organisations." },
];

export const timeline = [
  { year: "2009", title: "Began teaching Physics", body: "Started a teaching career in O/A-Level Physics that now spans over sixteen years." },
  { year: "2024", title: "Founded Jabran & Co", body: "Began operating an international business and advisory group (formally registered 2026)." },
  { year: "2025", title: "Eleventh Hour Cleaning Ltd (UK)", body: "Incorporated a UK facilities-management company (Companies House No. 16613599)." },
  { year: "2026", title: "AI operations & enterprise systems", body: "Deployed AI-driven CRM/ERP and a self-hosted AI-agent operations stack." },
];

export const philosophy = {
  quote: "Goods move. Advice lasts. Partnerships endure.",
  body: "Great businesses aren't built by selling products — they're built by solving problems. The through-line across teaching, consulting, and building companies is the same: rigor, evidence, and execution.",
};
