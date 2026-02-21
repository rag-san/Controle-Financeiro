import { Link2 } from "lucide-react";
import { Button } from "@/src/components/ui/Button";

type ConnectAccountButtonProps = {
  onClick: () => void;
};

export function ConnectAccountButton({ onClick }: ConnectAccountButtonProps): React.JSX.Element {
  return (
    <Button type="button" size="sm" onClick={onClick} className="h-9 rounded-xl bg-blue-500 px-4 text-white hover:bg-blue-600">
      <Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
      Conectar conta
    </Button>
  );
}
