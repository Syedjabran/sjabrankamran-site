import { FormSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <FormSkeleton label="email" fields={4} />;
}
