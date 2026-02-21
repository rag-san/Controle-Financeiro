import * as React from "react";
import type { NetWorthTabKey } from "@/src/features/networth/types";

type NetWorthTabsProps = {
  activeTab: NetWorthTabKey;
  assetsCount: number;
  debtsCount: number;
  onChange: (tab: NetWorthTabKey) => void;
};

type UnderlineState = {
  left: number;
  width: number;
};

function TabButton({
  id,
  active,
  label,
  count,
  onClick,
  onKeyDown,
  buttonRef,
  tabIndex
}: {
  id: string;
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
  tabIndex: number;
}): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      id={`networth-tab-${id}`}
      role="tab"
      type="button"
      aria-selected={active}
      aria-controls={`networth-panel-${id}`}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`relative inline-flex items-center gap-2 rounded-md px-1 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        active
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs transition-colors duration-200 ${
          active
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function NetWorthTabs({
  activeTab,
  assetsCount,
  debtsCount,
  onChange
}: NetWorthTabsProps): React.JSX.Element {
  const orderedTabs: NetWorthTabKey[] = ["assets", "debts"];
  const tabListRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef<Record<NetWorthTabKey, HTMLButtonElement | null>>({
    assets: null,
    debts: null
  });
  const [underline, setUnderline] = React.useState<UnderlineState>({ left: 0, width: 0 });

  const updateUnderline = React.useCallback(() => {
    const listElement = tabListRef.current;
    const activeButton = tabRefs.current[activeTab];
    if (!listElement || !activeButton) {
      return;
    }

    const listRect = listElement.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setUnderline({
      left: buttonRect.left - listRect.left,
      width: buttonRect.width
    });
  }, [activeTab]);

  React.useEffect(() => {
    updateUnderline();
    window.addEventListener("resize", updateUnderline);

    return () => {
      window.removeEventListener("resize", updateUnderline);
    };
  }, [updateUnderline]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: NetWorthTabKey): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const currentIndex = orderedTabs.indexOf(tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + orderedTabs.length) % orderedTabs.length;
    const nextTab = orderedTabs[nextIndex];

    onChange(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Selecionar tipo de patrimônio">
      <div ref={tabListRef} className="relative flex items-center gap-6">
        <TabButton
          id="assets"
          active={activeTab === "assets"}
          label="Ativos"
          count={assetsCount}
          onClick={() => onChange("assets")}
          onKeyDown={(event) => handleKeyDown(event, "assets")}
          buttonRef={(element) => {
            tabRefs.current.assets = element;
          }}
          tabIndex={activeTab === "assets" ? 0 : -1}
        />
        <TabButton
          id="debts"
          active={activeTab === "debts"}
          label="Dívidas"
          count={debtsCount}
          onClick={() => onChange("debts")}
          onKeyDown={(event) => handleKeyDown(event, "debts")}
          buttonRef={(element) => {
            tabRefs.current.debts = element;
          }}
          tabIndex={activeTab === "debts" ? 0 : -1}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ left: `${underline.left}px`, width: `${underline.width}px` }}
        />
      </div>
    </div>
  );
}
