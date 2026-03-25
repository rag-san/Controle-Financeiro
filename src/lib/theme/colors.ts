export const themeColors = {
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  mutedForeground: "hsl(var(--muted-foreground))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  error: "hsl(var(--error))",
  info: "hsl(var(--info))"
} as const;

export const chartColors = {
  brand: themeColors.primary,
  accent: themeColors.accent,
  info: themeColors.info,
  success: themeColors.success,
  warning: themeColors.warning,
  error: themeColors.error,
  muted: themeColors.mutedForeground
} as const;

export const categorySwatches = [
  themeColors.primary,
  themeColors.info,
  themeColors.success,
  themeColors.warning,
  themeColors.error,
  themeColors.mutedForeground
] as const;
