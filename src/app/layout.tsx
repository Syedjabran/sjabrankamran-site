import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
// KaTeX CSS is imported by the exam-runner client component (the only KaTeX
// renderer) so it is not render-blocking on every page. Same for driver.js
// CSS, used only by the product-tour components.
import { SITE } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { HydrationMarker } from "@/components/hydration-marker";
import { SiteFooter } from "@/components/site-footer";
import { EinsteinCompanion } from "@/components/einstein-companion";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Syed Jabran Ali Kamran — Physics Educator, Entrepreneur & AI Consultant",
    template: "%s — Syed Jabran Ali Kamran",
  },
  description:
    "Syed Jabran Ali Kamran is a Cambridge Physics educator with 16+ years' teaching experience across A-Level, O-Level and IBDP — and an entrepreneur and AI & technology consultant who builds ventures and intelligent systems from first principles.",
  keywords: [
    "Syed Jabran Ali Kamran",
    "Jabran Kamran",
    "Physics teacher Lahore",
    "A-Level Physics teacher Lahore",
    "O-Level Physics teacher Lahore",
    "IBDP Physics teacher",
    "Cambridge Physics educator",
    "Physics mentor",
    "AI in Physics education",
    "AI and technology consultant",
    "entrepreneur and educator",
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE.url,
    siteName: SITE.name,
    title: "Syed Jabran Ali Kamran — Physics Educator, Entrepreneur & AI Consultant",
    description:
      "16+ years teaching Cambridge Physics. Entrepreneur and AI & technology consultant. One mind, three connected worlds.",
    images: ["/jb-portrait.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Syed Jabran Ali Kamran — Physics Educator, Entrepreneur & AI Consultant",
    description:
      "16+ years teaching Cambridge Physics. Entrepreneur and AI & technology consultant.",
    creator: "@Syed_Jabran",
    images: ["/jb-portrait.jpg"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE.url },
};

export const viewport: Viewport = {
  themeColor: "#0B0F14",
  colorScheme: "dark",
};

const personSchema = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Syed Jabran Ali Kamran",
  alternateName: ["Jabran Kamran", "S. Jabran Kamran"],
  url: SITE.url,
  image: `${SITE.url}/jb-portrait.jpg`,
  jobTitle: "Physics Educator, Entrepreneur & AI Consultant",
  knowsAbout: [
    "Cambridge A-Level Physics",
    "Cambridge O-Level Physics",
    "IBDP Physics",
    "Physics education",
    "Entrepreneurship",
    "Artificial Intelligence",
    "Business strategy",
  ],
  worksFor: {
    "@type": "Organization",
    name: "Jabran & Co",
    url: "https://www.jabranandco.com",
  },
  sameAs: ["https://www.linkedin.com/company/jabran-co/", "https://x.com/Syed_Jabran"],
};

// Entity/GEO clarity: a stable WebSite + EducationalOrganization identity so
// answer engines resolve one consistent entity for the site and its teaching.
// Only verifiable facts — no ratings, awards, affiliations or outcomes.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE.url,
  inLanguage: "en",
  publisher: { "@type": "Person", name: SITE.name, url: SITE.url },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: "Syed Jabran Ali Kamran — Physics",
  url: SITE.url,
  logo: `${SITE.url}/icon.png`,
  image: `${SITE.url}/jb-portrait.jpg`,
  founder: { "@type": "Person", name: SITE.name, url: SITE.url },
  email: "physics@sjabrankamran.com",
  areaServed: "Global",
  knowsAbout: [
    "Cambridge International AS & A Level Physics (9702)",
    "Cambridge O Level Physics (5054)",
    "IB Physics",
  ],
  sameAs: ["https://www.linkedin.com/company/jabran-co/", "https://x.com/Syed_Jabran"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([websiteSchema, orgSchema, personSchema]) }}
        />
        <HydrationMarker />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <EinsteinCompanion />
        <Analytics />
      </body>
    </html>
  );
}
