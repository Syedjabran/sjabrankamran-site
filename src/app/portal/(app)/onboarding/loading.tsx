import { FormSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <FormSkeleton label="your profile form" fields={6} />;
}
