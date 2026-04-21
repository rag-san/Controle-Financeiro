import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, hideValue = false): string {
  if (hideValue) return "••••••";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function getInitials(name?: string | null): string {
  const safeName = (name ?? "").trim();
  if (!safeName) return "CF";
  const parts = safeName.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "CF";
}
