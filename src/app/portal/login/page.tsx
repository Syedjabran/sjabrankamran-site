import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Portal Login",
  description: "Sign in to the education portal.",
  robots: { index: false },
};

export default function PortalLoginPage() {
  return (
    <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden py-16">
      <div className="container-x relative w-full max-w-md">
        <p className="eyebrow mb-4 text-center">Education Portal</p>
        <h1 className="text-center text-3xl font-semibold text-ice">Sign in</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-fog">
          For enrolled students, parents, teachers and staff.
        </p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-space/80 p-6 shadow-xl backdrop-blur">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs leading-relaxed text-dust">
          Don&apos;t have an account yet? Accounts are created during admission —{" "}
          <a href="/contact" className="text-cyan hover:underline">
            contact us
          </a>{" "}
          to enrol.
        </p>
      </div>
    </section>
  );
}
