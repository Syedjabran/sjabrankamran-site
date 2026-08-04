import type { Metadata } from "next";
import { Playfair_Display, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
    default: SITE.title,
    template: "%s — Syed Jabran Ali Kamran",
  },
  description: SITE.description,
  keywords: [
    "Syed Jabran Ali Kamran",
    "Jabran Kamran",
    "S. Jabran Kamran",
    "entrepreneur",
    "strategic consultant",
    "physics educator",
    "industrial consulting",
    "AI transformation",
    "Jabran & Co",
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    creator: "@Syed_Jabran",
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
  jobTitle: "Entrepreneur, Educator & Strategic Consultant",
  worksFor: { "@type": "Organization", name: "Jabran & Co", url: "https://www.jabranandco.com" },
  sameAs: [
    "https://www.linkedin.com/company/jabran-co/",
    "https://x.com/Syed_Jabran",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${mono.variable}`}>
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
