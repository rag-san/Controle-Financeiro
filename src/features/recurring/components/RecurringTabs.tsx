import * as React from "react";
import type { RecurringFlowTab } from "@/src/features/recurring/types";

type RecurringTabsProps = {
  activeTab: RecurringFlowTab;
  onChange: (tab: RecurringFlowTab) => void;
};

const tabs: Array<{ id: RecurringFlowTab; label: string }> = [
  { id: "expenses", label: "Despesas" },
  { id: "income", label: "Receitas" }
];

export function RecurringTabs({ activeTab, onChange }: RecurringTabsProps): React.JSX.Element {
  const refs = React.useRef<Record<RecurringFlowTab, HTMLButtonElement | null>>({
    expenses: null,
    income: null
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: RecurringFlowTab): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const currentIndex = tabs.findIndex((item) => item.id === tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Selecionar tipo de recorrência" className="flex items-center gap-2">
      {tabs.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`recurring-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              selected
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
