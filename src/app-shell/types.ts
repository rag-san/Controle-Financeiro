export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  account: string;
  type: TransactionType;
  status: 'paid' | 'pending' | 'overdue';
}

export interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  bank: string;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  budget: number;
  spent: number;
}

export type ViewType = 
  | 'dashboard' 
  | 'transactions' 
  | 'cashflow' 
  | 'accounts' 
  | 'wealth' 
  | 'recurring' 
  | 'categories' 
  | 'reports';
