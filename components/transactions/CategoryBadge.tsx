import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CategoryBadgeProps = {
  name?: string | null;
  color?: string | null;
};

export function CategoryBadge({ name, color }: CategoryBadgeProps): React.JSX.Element {
  if (!name) {
    return <Badge variant="secondary">Sem categoria</Badge>;
  }

  return (
    <Badge
      className={cn("border-transparent")}
      style={{
        backgroundColor: `${color ?? "#94a3b8"}22`,
        color: color ?? "#334155"
      }}
    >
      {name}
    </Badge>
  );
}


