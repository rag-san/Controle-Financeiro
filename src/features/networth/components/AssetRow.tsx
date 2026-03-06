import { ChevronRight } from "lucide-react";
import { MiniWeightBar } from "@/src/features/networth/components/MiniWeightBar";
import { formatBRL } from "@/src/utils/format";

type AssetRowProps = {
  name: string;
  weight: number;
  value: number;
  color: string;
  isActive?: boolean;
  onSelect?: () => void;
};

export function AssetRow({
  name,
  weight,
  value,
  color,
  isActive = false,
  onSelect
}: AssetRowProps): React.JSX.Element {
  return (
    <tr
      className={`transition-colors duration-200 hover:bg-secondary/70 dark:hover:bg-secondary/40 ${
        isActive ? "bg-primary/10 dark:bg-primary/20" : ""
      }`}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-foreground dark:hover:text-foreground"
          aria-label={`Abrir detalhes de ${name}`}
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden="true" />
          <span>{name}</span>
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <MiniWeightBar weight={weight} color={color} />
          <span className="tabular-nums text-sm text-muted-foreground">
            {weight.toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="tabular-nums text-sm font-semibold text-foreground">
          {formatBRL(value)}
        </span>
      </td>
    </tr>
  );
}


