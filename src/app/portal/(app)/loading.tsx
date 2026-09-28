import { HomeSkeleton } from "@/components/portal-skeletons";

/**
 * Instant skeleton while a portal page streams: the home page's shape here,
 * and the fallback for any portal page without its own loading.tsx.
 */
export default function PortalLoading() {
  return <HomeSkeleton />;
}
