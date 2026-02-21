import { getCategoryStyle } from "@/src/features/categories/categoryStyle";
import { cn } from "@/lib/utils";

type CategoryPillSize = "sm" | "md";

type CategoryPillProps = {
  name: string;
  size?: CategoryPillSize;
  className?: string;
};

const pillSizeClassName: Record<CategoryPillSize, string> = {
  sm: "gap-1.5 px-2 py-0.5 text-[11px]",
  md: "gap-2 px-2.5 py-1 text-xs"
};

const dotSizeClassName: Record<CategoryPillSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2"
};

export function CategoryPill({
  name,
  size = "md",
  className
}: CategoryPillProps): React.JSX.Element {
  const label = name.trim() || "Sem categoria";
  const style = getCategoryStyle(label);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border font-medium leading-none",
        pillSizeClassName[size],
        style.className,
        className
      )}
      aria-label={`Categoria ${label}`}
    >
      <span
        aria-hidden="true"
        className={cn("rounded-full", dotSizeClassName[size], style.dotClassName)}
      />
      {style.icon ? (
        <span aria-hidden="true" className="text-[1em] leading-none">
          {style.icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
