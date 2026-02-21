import { useCallback, useMemo, useState } from "react";

type UseSelectionResult = {
  selectedIds: string[];
  selectedCount: number;
  selectedSet: Set<string>;
  isSelected: (id: string) => boolean;
  toggleSelection: (id: string, checked: boolean) => void;
  toggleSelectAll: (ids: string[], checked: boolean) => void;
  clearSelection: () => void;
  syncWithAvailableIds: (availableIds: string[]) => void;
};

export function useSelection(initialSelectedIds: string[] = []): UseSelectionResult {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const isSelected = useCallback(
    (id: string): boolean => selectedSet.has(id),
    [selectedSet]
  );

  const toggleSelection = useCallback((id: string, checked: boolean): void => {
    setSelectedIds((previous) => {
      if (checked) {
        return previous.includes(id) ? previous : [...previous, id];
      }
      return previous.filter((item) => item !== id);
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[], checked: boolean): void => {
    setSelectedIds((previous) => {
      if (!checked) {
        return previous.filter((id) => !ids.includes(id));
      }
      return [...new Set([...previous, ...ids])];
    });
  }, []);

  const clearSelection = useCallback((): void => {
    setSelectedIds([]);
  }, []);

  const syncWithAvailableIds = useCallback((availableIds: string[]): void => {
    setSelectedIds((previous) => previous.filter((id) => availableIds.includes(id)));
  }, []);

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    selectedSet,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    syncWithAvailableIds
  };
}
