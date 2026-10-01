// Производные показатели для экранов: топ продаж, динамика денег, расшифровка операций.
import type { BankOp, CashOp, ReportInput, SaleRow } from './types';
import type { OpiuResult } from './opiu';
import type { DdsResult } from './dds';
import { monthKey } from './dates';
import { shortProductName } from './products';
import { DDS_SECTIONS, OPIU_EXCLUDED_CATEGORIES, INCOME_CATEGORIES } from './config';

/** Последний месяц, за который есть выручка (текущий неполный месяц без продаж не берём) */
export function latestRevenueMonth(opiu: OpiuResult): number {
  const rev = opiu.rows.find(r => r.key === 'revenue')?.values ?? [];
  for (let i = rev.length - 1; i >= 0; i--) if (rev[i] > 0) return i;
  return Math.max(0, opiu.months.length - 1);
}

export interface TopProduct { name: string; amount: number; qty: number }

export function topProducts(sales: SaleRow[], period: string, n = 5): TopProduct[] {
  const m = new Map<string, TopProduct>();
  for (const s of sales) {
    if (s.period !== period) continue;
    const key = shortProductName(s.product);
    const e = m.get(key) || { name: key, amount: 0, qty: 0 };
    e.amount += s.amountWithNds;
    e.qty += s.qty;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n);
}

/**
 * Динамика «денег всего» по концам месяцев — от текущего остатка назад через чистый денежный поток ДДС.
 * Приближение: ДДС не включает курсовые разницы и операции вне разделов.
 */
export function moneySeries(dds: DdsResult, totalNow: number): number[] {
  const flows = dds.netFlow.values;
  const out = new Array(flows.length).fill(0) as number[];
  let acc = totalNow;
  for (let i = flows.length - 1; i >= 0; i--) {
    out[i] = acc;
    acc -= flows[i];
  }
  return out;
}

export interface DrillOp { date: Date; label: string; sub: string; amount: number; source: 'банк' | 'касса' }

/** Операции за месяц по статье — то, из чего сложена цифра в отчёте */
export function drillOperations(
  input: ReportInput, category: string, month: string, mode: 'opiu' | 'dds',
): DrillOp[] {
  const out: DrillOp[] = [];
  const sign = (type: string) => (type.trim().toLowerCase() === 'приход' ? 1 : -1);
  for (const b of input.bank as BankOp[]) {
    if (b.category !== category || monthKey(b.date) !== month) continue;
    if (mode === 'opiu' && (INCOME_CATEGORIES.includes(b.category) || OPIU_EXCLUDED_CATEGORIES.includes(b.category))) continue;
    out.push({ date: b.date, label: b.counterparty || b.purpose, sub: b.purpose, amount: (b.amountKzt || b.amount) * sign(b.type), source: 'банк' });
  }
  for (const c of input.cash as CashOp[]) {
    if (c.category.trim() !== category || monthKey(c.date) !== month) continue;
    if (c.type === 'перевод' || !c.amount) continue;
    out.push({ date: c.date, label: c.comment || c.walletFrom || c.walletTo, sub: c.walletFrom || c.walletTo, amount: c.amount * sign(c.type), source: 'касса' });
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** Себестоимость сырья по товарам за месяц (для расшифровки «Сырьё») — через разницу не считаем, отдаём продажи */
export const ALL_DDS_CATEGORIES = new Set(Object.values(DDS_SECTIONS).flat());
