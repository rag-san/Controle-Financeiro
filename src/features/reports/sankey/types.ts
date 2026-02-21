export type SankeyNodeKind =
  | "income"
  | "expenses"
  | "saved"
  | "category"
  | "subcategory";

export type SankeyNode = {
  id: string;
  label: string;
  kind: SankeyNodeKind;
  color: string;
  column: 0 | 1 | 2 | 3;
  displayValue?: number;
};

export type SankeyLink = {
  source: string;
  target: string;
  value: number;
  color: string;
};

export type SankeyModel = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
  totalExpense: number;
  netSaved: number;
};
