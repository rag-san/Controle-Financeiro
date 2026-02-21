"use client";

import { ArrowLeft, X } from "lucide-react";
import * as React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button } from "@/src/components/ui/Button";
import type { AllocationHistoryPoint, AllocationItem } from "@/src/features/networth/types";
import { formatBRL, formatDateLong, formatShortDate } from "@/src/utils/format";

type BreakdownItem = {
  id: string;
  label: string;
  value: number;
};

type AssetDetailsPanelProps = {
  open: boolean;
  title: string;
  item: AllocationItem | null;
  totalValue: number;
  history: AllocationHistoryPoint[];
  breakdownItems: BreakdownItem[];
  onClose: () => void;
};

type SparklinePayload = {
  value?: number;
  payload?: AllocationHistoryPoint;
};

function SparklineTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: SparklinePayload[];
  label?: string | number;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = typeof payload[0]?.value === "number" ? payload[0].value : 0;
  const labelValue = typeof label === "string" ? formatDateLong(label) : String(label ?? "");

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-700 dark:text-slate-200">{labelValue}</p>
      <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{formatBRL(value)}</p>
    </div>
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );

  return [...elements].filter((element) => !element.hasAttribute("aria-hidden"));
}

export function AssetDetailsPanel({
  open,
  title,
  item,
  totalValue,
  history,
  breakdownItems,
  onClose
}: AssetDetailsPanelProps): React.JSX.Element | null {
  const [isVisible, setIsVisible] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setIsVisible(false);
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const rafId = window.requestAnimationFrame(() => {
      setIsVisible(true);
      closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!panelRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === first || !panelRef.current.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  React.useEffect(() => {
    if (open) return;
    previousFocusRef.current?.focus();
  }, [open]);

  if (!open || !item) {
    return null;
  }

  const sharePercent = totalValue > 0 ? Number(((item.value / totalValue) * 100).toFixed(2)) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="presentation">
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Fechar painel de detalhes"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-details-title"
        className={`absolute right-0 top-0 h-full w-full max-w-md transform border-l border-slate-200 bg-white p-5 shadow-2xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-950 ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {title}
              </p>
              <h3 id="asset-details-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {item.name}
              </h3>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label={`Fechar detalhes de ${item.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor total</p>
              <p className="tabular-nums whitespace-nowrap text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {formatBRL(item.value)}
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sharePercent.toFixed(2)}% da carteira</p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Histórico
              </p>
              {history.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Histórico detalhado ficará disponível com mais pontos de dados.
                </p>
              ) : (
                <div className="h-28 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        minTickGap={14}
                      />
                      <Tooltip content={<SparklineTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={item.color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={true}
                        animationDuration={350}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Composição
              </p>

              {breakdownItems.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Sem detalhamento adicional para este item.
                </p>
              ) : (
                <ul className="space-y-2">
                  {breakdownItems.map((detail) => (
                    <li key={detail.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700 dark:text-slate-200">{detail.label}</span>
                      <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {formatBRL(detail.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-auto pt-5">
            <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
