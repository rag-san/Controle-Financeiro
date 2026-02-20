import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type CategoryPoint = {
  categoryId: string;
  name: string;
  color: string;
  current: number;
  previous: number;
  variation: number;
};

export function CategoryBars({ data }: { data: CategoryPoint[] }): React.JSX.Element {
  const max = Math.max(...data.map((item) => item.current), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = (item.current / max) * 100;
        return (
          <div key={item.categoryId} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </div>
              <div className="text-right text-sm">
                <span className="font-semibold">{formatMoney(item.current)}</span>
                <span
                  className={cn(
                    "ml-2 text-xs font-medium",
                    item.variation <= 0 ? "text-emerald-600" : "text-rose-600"
                  )}
                >
                  {item.variation > 0 ? "+" : ""}
                  {item.variation.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(width, 4)}%`,
                  backgroundColor: item.color
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}


