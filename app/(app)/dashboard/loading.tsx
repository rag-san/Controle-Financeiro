import { Skeleton } from "@/src/components/ui/Skeleton";

export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-[280px] lg:col-span-7 lg:h-[420px]" />
        <Skeleton className="h-[280px] lg:col-span-5 lg:h-[420px]" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-[240px] lg:col-span-5 lg:h-[320px]" />
        <Skeleton className="h-[240px] lg:col-span-7 lg:h-[320px]" />
      </div>
    </div>
  );
}


