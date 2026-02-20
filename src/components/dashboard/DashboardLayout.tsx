import { cn } from "@/lib/utils";
import { NetWorthCard } from "@/src/components/dashboard/NetWorthCard";
import { PartialResultCard } from "@/src/components/dashboard/PartialResultCard";
import { TopCategoriesCard } from "@/src/components/dashboard/TopCategoriesCard";

type NetWorthCardData = React.ComponentProps<typeof NetWorthCard>;
type PartialResultCardData = React.ComponentProps<typeof PartialResultCard>;
type TopCategoriesCardData = React.ComponentProps<typeof TopCategoriesCard>;

interface DashboardLayoutProps {
  netWorth: NetWorthCardData;
  partialResult: PartialResultCardData;
  topCategories: TopCategoriesCardData;
  className?: string;
}

export function DashboardLayout({
  netWorth,
  partialResult,
  topCategories,
  className
}: DashboardLayoutProps): React.JSX.Element {
  return (
    <main className={cn("min-h-screen bg-[#F8F9FA]", className)}>
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <NetWorthCard {...netWorth} />
          </div>

          <div className="xl:col-span-2">
            <PartialResultCard {...partialResult} />
          </div>

          <div className="xl:col-span-3">
            <TopCategoriesCard {...topCategories} />
          </div>
        </div>
      </div>
    </main>
  );
}

