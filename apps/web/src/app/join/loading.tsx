import { PublicShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonHeading, SkeletonLine, SkeletonRegion } from "@/components/Skeleton";

/** An invite page while the invite is read. */
export default function JoinLoading() {
  return (
    <PublicShell narrow>
      <SkeletonRegion className="pt-6" label="Loading the invite">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonHeading className="mt-3 w-full" />
        <SkeletonLine className="mt-3 w-2/3" />
        <SkeletonCard lines={3} className="mt-8" />
      </SkeletonRegion>
    </PublicShell>
  );
}
