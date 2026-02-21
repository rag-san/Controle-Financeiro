import { getCategoryChipClasses, getCategoryColor } from "@/src/features/categories/categoryColors";

const ICON_BY_CATEGORY_KEYWORD: Array<{ keyword: string; icon: string }> = [
  { keyword: "moradia", icon: "🏠" },
  { keyword: "supermercado", icon: "🛒" },
  { keyword: "energia eletrica", icon: "⚡" },
  { keyword: "energia", icon: "⚡" },
  { keyword: "restaurante", icon: "🍔" },
  { keyword: "combustivel", icon: "⛽" },
  { keyword: "internet", icon: "🌐" },
  { keyword: "delivery", icon: "🛵" },
  { keyword: "saude", icon: "🩺" },
  { keyword: "transporte", icon: "🚗" },
  { keyword: "transferencia", icon: "🔁" },
  { keyword: "transferencias", icon: "🔁" },
  { keyword: "transfer", icon: "🔁" }
];

function normalizeCategoryName(categoryName: string): string {
  return categoryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveCategoryIcon(categoryName: string): string | undefined {
  const normalized = normalizeCategoryName(categoryName);
  const match = ICON_BY_CATEGORY_KEYWORD.find((item) => normalized.includes(item.keyword));
  return match?.icon;
}

export function getCategoryColorKey(categoryName: string): string {
  return getCategoryColor(categoryName);
}

export function getCategoryStyle(categoryName: string): {
  className: string;
  dotClassName: string;
  icon?: string;
} {
  const chip = getCategoryChipClasses(categoryName);
  const icon = resolveCategoryIcon(categoryName);

  return {
    className: `${chip.bg} ${chip.border} ${chip.text}`,
    dotClassName: chip.dot,
    ...(icon ? { icon } : {})
  };
}
