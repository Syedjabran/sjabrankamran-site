import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { SITE } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
