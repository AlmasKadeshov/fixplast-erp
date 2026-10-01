import type { BankOp, CashOp } from './types';
import { monthKey } from './dates';
import { PERIOD_START } from './config';

export interface FlowOp { month: string; category: string; amount: number }

/** Операции кассы со знаком: приход +, расход −. Переводы между кошельками не считаются. */
export function cashExpensesAndIncomes(cash: CashOp[]): FlowOp[] {
  const out: FlowOp[] = [];
  for (const r of cash) {
    const type = r.type.toLowerCase();
    const category = r.category.trim();
    if (type === 'перевод' || category === 'Внутренний перевод') continue;
    const amount = r.amount || 0;
    if (amount <= 0) continue;
    out.push({ month: monthKey(r.date), category, amount: amount * (type === 'приход' ? 1 : -1) });
  }
  return out;
}

/** Закупка у перекупа (Stonex): расход из банка и кассы по статье «Себестоимость (Перекуп)» */
export function perekupByMonth(bank: BankOp[], cash: CashOp[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of bank) {
    if (r.category !== 'Себестоимость (Перекуп)' || r.type === 'приход') continue;
    const mk = monthKey(r.date);
    if (mk < PERIOD_START) continue;
    out[mk] = (out[mk] || 0) + Math.abs(r.amountKzt || r.amount || 0);
  }
  for (const r of cash) {
    if (r.type.toLowerCase() !== 'расход' || r.category !== 'Себестоимость (Перекуп)') continue;
    const mk = monthKey(r.date);
    if (mk < PERIOD_START) continue;
    out[mk] = (out[mk] || 0) + Math.abs(r.amount || 0);
  }
  return out;
}
