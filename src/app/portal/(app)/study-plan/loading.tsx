import { ListSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <ListSkeleton label="your study plan" filters={false} />;
}
