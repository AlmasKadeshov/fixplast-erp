import { Transaction } from '../models/finance';

export interface DayFlow {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export function groupByMonth(transactions: Transaction[]): Record<string, Transaction[]> {
  const groups: Record<string, Transaction[]> = {};
  for (const t of transactions) {
    const d = t.date instanceof Date ? t.date : t.date.toDate();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return groups;
}

export function sumByType(transactions: Transaction[], type: 'income' | 'expense'): number {
  return transactions.filter(t => t.type === type && t.status === 'fact').reduce((s, t) => s + t.amount, 0);
}

export function calcNetProfit(transactions: Transaction[]): number {
  const income = sumByType(transactions, 'income');
  const expense = sumByType(transactions, 'expense');
  return income - expense;
}

export function generateCashFlowChartData(transactions: Transaction[], months = 6): DayFlow[] {
  const now = new Date();
  const result: DayFlow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('ru-RU', { month: 'short', year: '2-digit' });
    const month = transactions.filter(t => {
      const td = t.date instanceof Date ? t.date : (t.date as { toDate(): Date }).toDate();
      return `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}` === key && t.status === 'fact';
    });
    const income = month.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = month.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    result.push({ date: label, income, expense, net: income - expense });
  }
  return result;
}
