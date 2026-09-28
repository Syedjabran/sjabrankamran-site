import { PanelSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <PanelSkeleton label="rankings and analytics" stats={4} panels={2} />;
}
