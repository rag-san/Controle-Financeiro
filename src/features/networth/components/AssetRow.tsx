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
      className={`transition-colors duration-200 hover:bg-slate-50/70 dark:hover:bg-slate-900/35 ${
        isActive ? "bg-blue-50/60 dark:bg-blue-950/20" : ""
      }`}
    >
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex items-center gap-2 text-sm font-medium text-slate-900 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-slate-100 dark:hover:text-slate-200"
          aria-label={`Abrir detalhes de ${name}`}
        >
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
          <span>{name}</span>
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <MiniWeightBar weight={weight} color={color} />
          <span className="tabular-nums text-sm text-slate-600 dark:text-slate-300">
            {weight.toFixed(2)}%
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
          {formatBRL(value)}
        </span>
      </td>
    </tr>
  );
}
