import { CardsSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <CardsSkeleton label="resources" cards={6} grid="sm:grid-cols-2 lg:grid-cols-3" />;
}
