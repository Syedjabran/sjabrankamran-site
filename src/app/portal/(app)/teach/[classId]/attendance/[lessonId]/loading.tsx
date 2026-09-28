import { ListSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <ListSkeleton label="the register" rows={8} filters={false} />;
}
