import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[420px] xl:col-span-7" />
        <Skeleton className="h-[420px] xl:col-span-5" />
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <Skeleton className="h-[320px] xl:col-span-5" />
        <Skeleton className="h-[320px] xl:col-span-7" />
      </div>
    </div>
  );
}


