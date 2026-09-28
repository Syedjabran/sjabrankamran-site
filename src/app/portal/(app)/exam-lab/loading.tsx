import { CardsSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <CardsSkeleton label="the Exam Lab" cards={6} grid="grid-cols-2 md:grid-cols-3" cardClass="h-20" />;
}
