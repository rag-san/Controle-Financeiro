"use client";

import { Categories } from "@/src/features/categories/CategoriesPage";
import { useNovaShell } from "@/src/app-shell/AppShellContext";

export default function CategoriesRoutePage(): React.JSX.Element {
  const { hideValues } = useNovaShell();
  return <Categories hideValues={hideValues} />;
}
