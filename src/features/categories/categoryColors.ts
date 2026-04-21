import { categorySwatches, themeColors } from "@/src/lib/theme/colors";

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
    key: "brand",
    chart: themeColors.primary,
    chip: {
      bg: "bg-primary/10 dark:bg-primary/15",
      border: "border-primary/20 dark:border-primary/30",
      text: "text-primary",
      dot: "bg-primary"
    }
  },
  {
    key: "info",
    chart: themeColors.info,
    chip: {
      bg: "bg-info/10 dark:bg-info/15",
      border: "border-info/20 dark:border-info/30",
      text: "text-info",
      dot: "bg-info"
    }
  },
  {
    key: "success",
    chart: themeColors.success,
    chip: {
      bg: "bg-success/10 dark:bg-success/15",
      border: "border-success/20 dark:border-success/30",
      text: "text-success",
      dot: "bg-success"
    }
  },
  {
    key: "warning",
    chart: themeColors.warning,
    chip: {
      bg: "bg-warning/10 dark:bg-warning/15",
      border: "border-warning/20 dark:border-warning/30",
      text: "text-warning",
      dot: "bg-warning"
    }
  },
  {
    key: "error",
    chart: themeColors.error,
    chip: {
      bg: "bg-error/10 dark:bg-error/15",
      border: "border-error/20 dark:border-error/30",
      text: "text-error",
      dot: "bg-error"
    }
  },
  {
    key: "neutral",
    chart: themeColors.mutedForeground,
    chip: {
      bg: "bg-secondary/70 dark:bg-secondary/45",
      border: "border-border/80 dark:border-border/70",
      text: "text-foreground",
      dot: "bg-muted-foreground"
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
      key: "neutral",
      chart: themeColors.mutedForeground,
      chip: {
        bg: "bg-secondary/70 dark:bg-secondary/45",
        border: "border-border/80 dark:border-border/70",
        text: "text-foreground",
        dot: "bg-muted-foreground"
      }
    };
  }

  const normalized = normalizeCategoryName(categoryName || "sem categoria");
  const hash = hashCategoryName(normalized);
  return CATEGORY_COLOR_PALETTE[hash % CATEGORY_COLOR_PALETTE.length];
}

export const CATEGORY_COLOR_SWATCHES = categorySwatches;

export function getCategoryColor(categoryName: string): string {
  return resolvePaletteItem(categoryName).chart;
}
