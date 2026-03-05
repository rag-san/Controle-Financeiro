import type { AllocationItem } from "@/src/features/networth/types";

type AllocationBarProps = {
  items: AllocationItem[];
  onItemSelect?: (item: AllocationItem) => void;
};

export function AllocationBar({ items, onItemSelect }: AllocationBarProps): React.JSX.Element {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground dark:border-border dark:text-muted-foreground/80">
        Nenhum item de alocação disponível para este período.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-secondary/70 dark:bg-secondary/80"
        aria-hidden="true"
      >
        {items.map((item) => (
          <span
            key={item.id}
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(item.weight, 0)}%`,
              backgroundColor: item.color
            }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={`legend-${item.id}`}>
            <button
              type="button"
              onClick={() => onItemSelect?.(item)}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-secondary"
              aria-label={`Ver detalhes de ${item.name}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span>
                {item.name} {item.weight.toFixed(0)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


