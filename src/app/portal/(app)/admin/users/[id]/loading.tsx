import { PanelSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <PanelSkeleton label="this user" stats={4} panels={2} />;
}
