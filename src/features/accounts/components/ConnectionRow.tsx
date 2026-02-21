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
    <div className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 dark:hover:bg-slate-900/35">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{institution}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge value={statusLabel} variant="positive" className="px-2 py-0.5 text-[10px] tracking-wide" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {accountCount} conta{accountCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnectDisabled}
        className="rounded-md px-2 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
        aria-label={`Disconnect ${institution}`}
      >
        Desconectar
      </button>
    </div>
  );
}
