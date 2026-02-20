"use client";

import { CashflowMonthlyChart } from "@/src/features/dashboard/charts/CashflowMonthlyChart";

type CashflowPoint = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

export function CashflowBar({ data }: { data: CashflowPoint[] }): React.JSX.Element {
  return <CashflowMonthlyChart data={data} />;
}

