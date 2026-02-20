import { useRef } from "react";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { Badge } from "@/src/components/ui/Badge";
import { Card } from "@/src/components/ui/Card";
import { formatBRL } from "@/src/utils/format";

export type NetWorthFilter = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

interface NetWorthCardProps {
  valorTotal: number;
  variacao: number;
  isDataAvailable: boolean;
  activeFilter: NetWorthFilter;
  onFilterChange?: (filter: NetWorthFilter) => void;
  hrefVerTodas?: string;
}

const FILTERS: NetWorthFilter[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

function getVariationVariant(variacao: number): "positive" | "negative" | "neutral" {
  if (variacao > 0) return "positive";
  if (variacao < 0) return "negative";
  return "neutral";
}

function getVariationLabel(variacao: number): string {
  const absoluteFormattedValue = formatBRL(Math.abs(variacao));
  if (variacao > 0) return `+${absoluteFormattedValue}`;
  if (variacao < 0) return `-${absoluteFormattedValue}`;
  return absoluteFormattedValue;
}

export function NetWorthCard({
  valorTotal,
  variacao,
  isDataAvailable,
  activeFilter,
  onFilterChange,
  hrefVerTodas
}: NetWorthCardProps): React.JSX.Element {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusFilterByIndex = (targetIndex: number): void => {
    const safeIndex = (targetIndex + FILTERS.length) % FILTERS.length;
    buttonRefs.current[safeIndex]?.focus();
  };

  const handleFilterKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number): void => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusFilterByIndex(currentIndex + 1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusFilterByIndex(currentIndex - 1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusFilterByIndex(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      focusFilterByIndex(FILTERS.length - 1);
    }
  };

  return (
    <Card className="flex h-full flex-col justify-between gap-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">PATRIMONIO</h2>
          {hrefVerTodas ? (
            <Link
              href={hrefVerTodas}
              className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              ver todas
            </Link>
          ) : null}
        </div>

        {isDataAvailable ? (
          <div className="space-y-3">
            <p className="text-3xl font-semibold text-slate-900">{formatBRL(valorTotal)}</p>
            <Badge value={getVariationLabel(variacao)} variant={getVariationVariant(variacao)} />
          </div>
        ) : (
          <div
            role="status"
            className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center"
          >
            <Clock3 className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-500">Dados disponiveis apos 7 dias</p>
          </div>
        )}
      </div>

      <div role="group" aria-label="Filtros de periodo do patrimonio" className="flex flex-wrap gap-2">
        {FILTERS.map((filter, index) => {
          const isActive = filter === activeFilter;

          return (
            <button
              key={filter}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFilterChange?.(filter)}
              onKeyDown={(event) => handleFilterKeyDown(event, index)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isActive ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {filter}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
