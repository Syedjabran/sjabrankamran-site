import { ListSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <ListSkeleton label="users" rows={8} />;
}
