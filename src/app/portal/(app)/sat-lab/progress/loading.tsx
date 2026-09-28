import { PanelSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <PanelSkeleton label="your SAT progress" stats={4} />;
}
