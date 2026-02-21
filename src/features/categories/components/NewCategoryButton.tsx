import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

type NewCategoryButtonProps = {
  onClick: () => void;
};

export function NewCategoryButton({ onClick }: NewCategoryButtonProps): React.JSX.Element {
  return (
    <Button type="button" onClick={onClick} aria-label="Criar nova categoria">
      <Plus className="h-4 w-4" />
      Nova Categoria
    </Button>
  );
}
