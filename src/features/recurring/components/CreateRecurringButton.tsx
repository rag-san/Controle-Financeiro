import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

type CreateRecurringButtonProps = {
  onClick: () => void;
};

export function CreateRecurringButton({ onClick }: CreateRecurringButtonProps): React.JSX.Element {
  return (
    <Button type="button" onClick={onClick} aria-label="Criar novo recorrente">
      <Plus className="h-4 w-4" />
      Criar Novo
    </Button>
  );
}
