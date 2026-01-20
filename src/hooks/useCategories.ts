import { useCallback, useEffect, useState } from "react";
import { requestJson } from "../utils/api";
import type { Category } from "../utils/transactions";

type CategoriesResponse = {
  categories: Category[];
};

type UseCategoriesOptions = {
  enabled?: boolean;
};

export function useCategories(options: UseCategoriesOptions = {}) {
  const { enabled = true } = options;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<CategoriesResponse>("/api/categories");
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function addCategory(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    const data = await requestJson<CategoriesResponse>("/api/categories", {
      method: "POST",
      body: { name: normalized },
    });
    setCategories(data.categories);
  }

  async function removeCategory(value: Category) {
    if (value === "Outros") return;
    const data = await requestJson<CategoriesResponse>(
      `/api/categories/${encodeURIComponent(value)}`,
      {
        method: "DELETE",
      }
    );
    setCategories(data.categories);
  }

  async function resetCategories() {
    const data = await requestJson<CategoriesResponse>("/api/categories/reset", {
      method: "POST",
    });
    setCategories(data.categories);
  }

  return {
    categories,
    loading,
    error,
    reload: loadCategories,
    addCategory,
    removeCategory,
    resetCategories,
  };
}
