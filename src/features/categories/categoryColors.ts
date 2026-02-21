type CategoryColorPaletteItem = {
  key: string;
  chart: string;
  chip: {
    bg: string;
    border: string;
    text: string;
    dot: string;
  };
};

const CATEGORY_COLOR_PALETTE: CategoryColorPaletteItem[] = [
  {
    key: "violet",
    chart: "#8b5cf6",
    chip: {
      bg: "bg-violet-50 dark:bg-violet-950/30",
      border: "border-violet-200 dark:border-violet-900/60",
      text: "text-violet-700 dark:text-violet-300",
      dot: "bg-violet-500 dark:bg-violet-400"
    }
  },
  {
    key: "emerald",
    chart: "#10b981",
    chip: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-900/60",
      text: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500 dark:bg-emerald-400"
    }
  },
  {
    key: "amber",
    chart: "#f59e0b",
    chip: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-900/60",
      text: "text-amber-700 dark:text-amber-300",
      dot: "bg-amber-500 dark:bg-amber-400"
    }
  },
  {
    key: "sky",
    chart: "#0ea5e9",
    chip: {
      bg: "bg-sky-50 dark:bg-sky-950/30",
      border: "border-sky-200 dark:border-sky-900/60",
      text: "text-sky-700 dark:text-sky-300",
      dot: "bg-sky-500 dark:bg-sky-400"
    }
  },
  {
    key: "rose",
    chart: "#f43f5e",
    chip: {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-200 dark:border-rose-900/60",
      text: "text-rose-700 dark:text-rose-300",
      dot: "bg-rose-500 dark:bg-rose-400"
    }
  },
  {
    key: "orange",
    chart: "#f97316",
    chip: {
      bg: "bg-orange-50 dark:bg-orange-950/30",
      border: "border-orange-200 dark:border-orange-900/60",
      text: "text-orange-700 dark:text-orange-300",
      dot: "bg-orange-500 dark:bg-orange-400"
    }
  },
  {
    key: "cyan",
    chart: "#06b6d4",
    chip: {
      bg: "bg-cyan-50 dark:bg-cyan-950/30",
      border: "border-cyan-200 dark:border-cyan-900/60",
      text: "text-cyan-700 dark:text-cyan-300",
      dot: "bg-cyan-500 dark:bg-cyan-400"
    }
  },
  {
    key: "lime",
    chart: "#84cc16",
    chip: {
      bg: "bg-lime-50 dark:bg-lime-950/30",
      border: "border-lime-200 dark:border-lime-900/60",
      text: "text-lime-700 dark:text-lime-300",
      dot: "bg-lime-500 dark:bg-lime-400"
    }
  },
  {
    key: "indigo",
    chart: "#6366f1",
    chip: {
      bg: "bg-indigo-50 dark:bg-indigo-950/30",
      border: "border-indigo-200 dark:border-indigo-900/60",
      text: "text-indigo-700 dark:text-indigo-300",
      dot: "bg-indigo-500 dark:bg-indigo-400"
    }
  },
  {
    key: "teal",
    chart: "#14b8a6",
    chip: {
      bg: "bg-teal-50 dark:bg-teal-950/30",
      border: "border-teal-200 dark:border-teal-900/60",
      text: "text-teal-700 dark:text-teal-300",
      dot: "bg-teal-500 dark:bg-teal-400"
    }
  },
  {
    key: "fuchsia",
    chart: "#d946ef",
    chip: {
      bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30",
      border: "border-fuchsia-200 dark:border-fuchsia-900/60",
      text: "text-fuchsia-700 dark:text-fuchsia-300",
      dot: "bg-fuchsia-500 dark:bg-fuchsia-400"
    }
  },
  {
    key: "blue",
    chart: "#3b82f6",
    chip: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-900/60",
      text: "text-blue-700 dark:text-blue-300",
      dot: "bg-blue-500 dark:bg-blue-400"
    }
  }
];

function normalizeCategoryName(categoryName: string): string {
  return categoryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hashCategoryName(categoryName: string): number {
  let hash = 0;
  for (let index = 0; index < categoryName.length; index += 1) {
    hash = (hash << 5) - hash + categoryName.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function resolvePaletteItem(categoryName: string): CategoryColorPaletteItem {
  if (normalizeCategoryName(categoryName) === "other") {
    return {
      key: "other",
      chart: "#9ca3af",
      chip: {
        bg: "bg-slate-50 dark:bg-slate-900/40",
        border: "border-slate-200 dark:border-slate-700/70",
        text: "text-slate-700 dark:text-slate-200",
        dot: "bg-slate-500 dark:bg-slate-300"
      }
    };
  }

  const normalized = normalizeCategoryName(categoryName || "sem categoria");
  const hash = hashCategoryName(normalized);
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

export function getCategoryColor(categoryName: string): string {
  return resolvePaletteItem(categoryName).chart;
}

export function getCategoryChipClasses(categoryName: string): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  return resolvePaletteItem(categoryName).chip;
}
