import { Badge } from "@/src/components/ui/Badge";

type ConnectionRowProps = {
  institution: string;
  accountCount: number;
  statusLabel?: string;
  onDisconnect?: () => void;
  disconnectDisabled?: boolean;
};

export function ConnectionRow({
  institution,
  accountCount,
  statusLabel = "UPDATED",
  onDisconnect,
  disconnectDisabled = false
}: ConnectionRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-secondary/70 dark:hover:bg-secondary/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{institution}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge value={statusLabel} variant="positive" className="px-2 py-0.5 text-[10px] tracking-wide" />
          <span className="text-xs text-muted-foreground">
            {accountCount} conta{accountCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnectDisabled}
        className="rounded-md px-2 py-1 text-sm font-medium text-error transition hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error disabled:cursor-not-allowed disabled:opacity-50 dark:text-error dark:hover:bg-error/10 dark:hover:text-error"
        aria-label={`Disconnect ${institution}`}
      >
        Desconectar
      </button>
    </div>
  );
}


