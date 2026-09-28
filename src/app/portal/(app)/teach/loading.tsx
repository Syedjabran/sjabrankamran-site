import { CardsSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <CardsSkeleton label="your classes" cards={4} grid="sm:grid-cols-2" />;
}
