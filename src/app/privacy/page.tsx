import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How sjabrankamran.com collects, uses and protects personal information submitted through the contact form and Physics Studio.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This site collects as little personal information as it can. This page explains what is collected, why, who processes it, and how you can have it removed."
      updated="20 November 2026"
    >
      <LegalSection title="Who is responsible">
        <p>
          This website, sjabrankamran.com, is the personal website of Syed Jabran Ali Kamran
          (&ldquo;I&rdquo;, &ldquo;me&rdquo;). I am responsible for the personal information collected
          through it. You can reach me about privacy through the{" "}
          <Link href="/contact">contact form</Link> or at{" "}
          <a href="mailto:physics@sjabrankamran.com">physics@sjabrankamran.com</a>.
        </p>
        <p>
          The student portal and Exam Lab now run on scholexai.com. Links to those services redirect
          there, and that site&apos;s own privacy policy covers them.
        </p>
      </LegalSection>

      <LegalSection title="What I collect">
        <ul>
          <li>
            <strong>Contact form.</strong> Your name, email address, enquiry type and message, plus your
            consent to be contacted. I use these only to read and reply to your enquiry.
          </li>
          <li>
            <strong>Physics Studio questions.</strong> Your question, the curriculum, topic and answer
            style you choose, and the AI-generated answer. Your email address is stored only if you
            enter it and tick the consent box.
          </li>
          <li>
            <strong>Technical data.</strong> Your IP address is used briefly in memory to limit repeated
            requests and prevent abuse. It is not stored with your submission.
          </li>
          <li>
            <strong>Analytics.</strong> The site uses Vercel Web Analytics, which counts page views
            without cookies and without identifying individual visitors.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          This site sets no advertising or tracking cookies. Your browser&apos;s local storage holds a
          few small preferences, such as where you moved the on-screen companion and whether you have
          already seen the guided tour. These never leave your device, and clearing your browser
          storage removes them.
        </p>
      </LegalSection>

      <LegalSection title="Who processes your information">
        <p>Your information is shared only with the services needed to run this site:</p>
        <ul>
          <li><strong>Vercel</strong> hosts the website and provides the analytics.</li>
          <li><strong>Supabase</strong> stores contact enquiries and Physics Studio questions.</li>
          <li><strong>Resend</strong> delivers enquiry notifications to my inbox.</li>
          <li>
            <strong>Google (Gemini API)</strong> generates the AI answers in Physics Studio. Your question
            text is sent to it. Your email address is not.
          </li>
        </ul>
        <p>I do not sell, rent or trade personal information, and I do not use it for advertising.</p>
      </LegalSection>

      <LegalSection title="Physics Studio Library">
        <p>
          Questions are private by default. I may review a question and publish it, with its answer, in
          the public Physics Studio Library so other students can learn from it. Published entries never
          include your email address or any other detail that identifies you. If you recognise a
          question of yours and want it removed, contact me and I will remove it.
        </p>
      </LegalSection>

      <LegalSection title="How long I keep it">
        <p>
          I keep enquiries and questions for as long as they are needed to respond, to follow up, and to
          improve the teaching material, and then delete them. You can ask for your information to be
          deleted at any time.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask me to show you the personal information I hold about you, to correct it, or to
          delete it. You can also withdraw your consent at any time. Send your request through the{" "}
          <Link href="/contact">contact form</Link> or by email, and I will reply within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Physics Studio is used by school students. A student under 13 should ask a parent or guardian
          before entering an email address. A parent or guardian can ask me to delete a child&apos;s
          information at any time.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          All traffic to this site is encrypted with HTTPS. Stored data is protected by access controls,
          and only I can read submissions. No method of storage or transmission is perfectly secure, but
          I take reasonable steps to protect what you send.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If this policy changes, I will update this page and the date at the top. Please also read the{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
