import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/src/components/ui/Card";
import type { ReportsMerchantSpend, ReportsPeriodRange } from "@/src/features/reports/types";
import { formatBRL } from "@/src/utils/format";

type TopMerchantsCardProps = {
  merchants: ReportsMerchantSpend[];
  period: ReportsPeriodRange;
};

function buildMerchantHref(merchantKey: string, period: ReportsPeriodRange): string {
  const params = new URLSearchParams();
  params.set("period", "custom");
  params.set("from", format(period.start, "yyyy-MM-dd"));
  params.set("to", period.end.toISOString());
  params.set("q", merchantKey);
  params.set("type", "expense");
  return `/transactions?${params.toString()}`;
}

export function TopMerchantsCard({
  merchants,
  period
}: TopMerchantsCardProps): React.JSX.Element {
  const topRows = merchants.slice(0, 8);

  return (
    <Card className="p-4">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Maiores estabelecimentos
      </h3>

      {topRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sem despesas de estabelecimentos no período.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Estabelecimento
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Qtd
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {topRows.map((row) => (
                <tr key={row.merchantKey} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                  <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                    <Link
                      href={buildMerchantHref(row.merchantKey, period)}
                      className="line-clamp-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {row.merchantLabel}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{row.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatBRL(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

