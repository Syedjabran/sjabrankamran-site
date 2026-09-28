import { FormSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <FormSkeleton label="your SAT settings" fields={5} />;
}
