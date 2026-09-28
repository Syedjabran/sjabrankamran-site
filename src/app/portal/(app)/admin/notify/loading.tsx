import { FormSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <FormSkeleton label="announcements" fields={4} />;
}
