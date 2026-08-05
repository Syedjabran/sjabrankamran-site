import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden py-16">
      <div className="container-x relative w-full max-w-md">
        <p className="eyebrow mb-4 text-center">Education Portal</p>
        <h1 className="text-center text-3xl font-semibold text-ice">Set a new password</h1>
        <div className="mt-8 rounded-2xl border border-white/10 bg-space/80 p-6 shadow-xl backdrop-blur">
          <ResetForm />
        </div>
      </div>
    </section>
  );
}
