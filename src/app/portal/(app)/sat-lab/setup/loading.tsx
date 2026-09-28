import { FormSkeleton } from "@/components/portal-skeletons";

export default function Loading() {
  return <FormSkeleton label="SAT setup" fields={5} />;
}
