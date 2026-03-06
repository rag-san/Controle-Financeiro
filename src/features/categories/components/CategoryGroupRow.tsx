import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { formatBRL } from "@/src/utils/format";

type CategoryGroupRowProps = {
  name: string;
  total: number;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
};

export function CategoryGroupRow({
  name,
  total,
  count,
  collapsed,
  onToggle
}: CategoryGroupRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-4 rounded-lg bg-secondary/55 px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-secondary/45 dark:hover:bg-secondary/70"
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Expandir" : "Recolher"} grupo ${name}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        <Badge value={String(count)} variant="neutral" className="px-2 py-0.5 text-[11px]" />
      </div>

      <span className="text-xs text-muted-foreground">Categorias</span>

      <p className="tabular-nums text-right text-sm font-semibold text-foreground">
        {formatBRL(total)}
      </p>
    </button>
  );
}


