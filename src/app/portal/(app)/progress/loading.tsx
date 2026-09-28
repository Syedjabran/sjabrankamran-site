import { PanelSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <PanelSkeleton label="your progress" stats={4} panels={2} />;
}
