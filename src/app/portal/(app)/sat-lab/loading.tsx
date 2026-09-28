import { PanelSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <PanelSkeleton label="the SAT Lab" panels={2} panelClass="h-56" />;
}
