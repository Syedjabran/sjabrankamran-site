import { Download } from "lucide-react";
import { InstallAppClient } from "./install-app-client";

export const metadata = { title: "Install Portal App", robots: { index: false } };

export default function InstallPortalAppPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 text-cyan">
          <Download size={18} />
        </span>
        <div>
          <h1 className="font-display text-2xl text-ice">Install Portal App</h1>
          <p className="text-sm text-dust">Add the Physics Portal to your phone, tablet, or computer.</p>
        </div>
      </div>
      <InstallAppClient />
    </div>
  );
}
