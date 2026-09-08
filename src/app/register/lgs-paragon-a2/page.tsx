import { Metadata } from "next";
import { RegistrationForm } from "../lgs-paragon-a1/registration-form";

export const metadata: Metadata = {
  title: "Student Registration — LGS Paragon A2 Physics",
  description: "Register for your LGS Paragon A2 (Year 2) Physics portal account",
  robots: { index: false },
};

export default function LGSParagonA2RegistrationPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-void via-abyss to-space">
      <div className="container-x py-12">
        <div className="mx-auto max-w-lg">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan/30 bg-cyan/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <h1 className="font-display text-2xl font-semibold text-ice">LGS Paragon — A2 Physics</h1>
            <p className="mt-2 text-sm text-dust">Create your Physics Learning Portal account</p>
          </div>

          {/* Form Card */}
          <div className="rounded-2xl border border-white/10 bg-space/60 p-6 backdrop-blur-sm">
            <RegistrationForm
              enrollmentCode="PARAGON-A2-2026"
              schoolName="LGS Paragon"
              className="A2 (Year 2) Physics"
            />
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-dust">
            Having trouble? Contact your teacher or email{" "}
            <a href="mailto:physics@sjabrankamran.com" className="text-cyan hover:underline">
              physics@sjabrankamran.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
