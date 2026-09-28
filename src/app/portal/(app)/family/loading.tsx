import { CardsSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <CardsSkeleton label="your children" cards={2} grid="sm:grid-cols-2" cardClass="h-48" />;
}
