import { useEffect, useState } from "react";
import {
  CATEGORY_STORAGE_KEY,
  DEFAULT_CATEGORIES,
  ensureDefaultCategory,
  type Category,
} from "../utils/transactions";

type UseCategoriesOptions = {
  storageKey?: string;
};

export function useCategories(options: UseCategoriesOptions = {}) {
  const storageKey = options.storageKey ?? CATEGORY_STORAGE_KEY;

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return DEFAULT_CATEGORIES;
      const parsed = JSON.parse(raw) as Category[];
      if (!Array.isArray(parsed)) return DEFAULT_CATEGORIES;
      return ensureDefaultCategory(parsed);
    } catch {
      return DEFAULT_CATEGORIES;
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(categories));
  }, [storageKey, categories]);

  function addCategory(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    setCategories((prev) => ensureDefaultCategory([...prev, normalized]));
  }

  function removeCategory(value: Category) {
    if (value === "Outros") return;
    setCategories((prev) =>
      ensureDefaultCategory(prev.filter((item) => item !== value))
    );
  }

  function resetCategories() {
    setCategories(DEFAULT_CATEGORIES);
  }

  return {
    categories,
    addCategory,
    removeCategory,
    resetCategories,
  };
}
