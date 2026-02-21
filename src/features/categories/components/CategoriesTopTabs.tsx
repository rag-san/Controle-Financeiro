import * as React from "react";

export type CategoriesTopTab = "categories" | "automations";

type CategoriesTopTabsProps = {
  activeTab: CategoriesTopTab;
  onChange: (tab: CategoriesTopTab) => void;
};

const tabs: Array<{ id: CategoriesTopTab; label: string }> = [
  { id: "categories", label: "Categorias" },
  { id: "automations", label: "Automações" }
];

export function CategoriesTopTabs({
  activeTab,
  onChange
}: CategoriesTopTabsProps): React.JSX.Element {
  const refs = React.useRef<Record<CategoriesTopTab, HTMLButtonElement | null>>({
    categories: null,
    automations: null
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: CategoriesTopTab): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

    event.preventDefault();
    const currentIndex = tabs.findIndex((item) => item.id === tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    onChange(nextTab.id);
    refs.current[nextTab.id]?.focus();
  };

  return (
    <div role="tablist" aria-label="Alternar entre categorias e automações" className="flex items-center gap-2">
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
            aria-controls={`categories-panel-${tab.id}`}
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
