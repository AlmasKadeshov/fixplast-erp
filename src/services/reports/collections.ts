// Начислено и получено: продажи по начислению (1С, с НДС) против факта оплат клиентов (банк + касса).
// Оплатой клиента считаются статьи «Оплата клиента» и «Возврат оплаты клиенту» (со знаком по направлению операции, как в ДДС). Переводы и прочие приходы не входят.
import type { ReportInput } from './types';
import type { DdsResult } from './dds';
import { PERIOD_START } from './config';
import { currentMonthKey, monthKey, monthLabel } from './dates';

export const PAYMENT_CATEGORY = 'Оплата клиента';
export const REFUND_CATEGORY = 'Возврат оплаты клиенту';

export interface CollectionsResult {
  months: string[];
  labels: string[];
  accrued: number[];     // начислено (продажи с НДС)
  received: number[];    // получено от клиентов, за вычетом возвратов
  gap: number[];         // начислено − получено: рост долга за месяц
  cumGap: number[];      // накопленный разрыв
  rate: number[];        // собираемость, %
  totals: { accrued: number; received: number; gap: number; rate: number };
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function buildCollections(input: ReportInput, periodEnd: string = currentMonthKey()): CollectionsResult {
  const accrued: Record<string, number> = {};
  const received: Record<string, number> = {};
  const inRange = (mk: string) => mk >= PERIOD_START && mk <= periodEnd;

  for (const s of input.sales) {
    if (inRange(s.period)) accrued[s.period] = (accrued[s.period] || 0) + s.amountWithNds;
  }
  // Знак по направлению операции, как в ДДС: приход +, расход −. Так «получено» всегда бьётся с ДДС.
  const add = (mk: string, category: string, amount: number) => {
    if ((category === PAYMENT_CATEGORY || category === REFUND_CATEGORY) && inRange(mk)) received[mk] = (received[mk] || 0) + amount;
  };
  for (const r of input.bank) {
    const amount = Math.abs(r.amountKzt || r.amount || 0);
    add(monthKey(r.date), r.category.trim(), r.type.trim().toLowerCase() === 'приход' ? amount : -amount);
  }
  for (const c of input.cash) {
    const t = c.type.toLowerCase();
    if (t === 'перевод') continue;
    add(monthKey(c.date), c.category.trim(), t === 'приход' ? Math.abs(c.amount || 0) : -Math.abs(c.amount || 0));
  }

  const months = [...new Set([...Object.keys(accrued), ...Object.keys(received)])].sort();
  const a = months.map(m => accrued[m] || 0);
  const r = months.map(m => received[m] || 0);
  const gap = a.map((v, i) => v - r[i]);
  let run = 0;
  const cumGap = gap.map(g => (run += g));
  const rate = a.map((v, i) => (v > 0 ? (r[i] / v) * 100 : 0));
  const ta = sum(a), tr = sum(r);
  return {
    months, labels: months.map(monthLabel), accrued: a, received: r, gap, cumGap, rate,
    totals: { accrued: ta, received: tr, gap: ta - tr, rate: ta > 0 ? (tr / ta) * 100 : 0 },
  };
}

export interface CashCycleResult extends CollectionsResult {
  otherIn: number[];     // прочие поступления (займы, взносы учредителя и т.п.)
  spent: number[];       // расходы по ДДС (положительным числом)
  net: number[];         // чистый денежный поток (ДДС)
  closing: number[];     // остаток денег на конец месяца
  shortfall: boolean[];  // получено от клиентов меньше расходов
  totalsCycle: { otherIn: number; spent: number; net: number };
}

/** Денежный цикл: начислено → получено → расходы → чистый поток → остаток. Расходы и поток берутся из ДДС. */
export function buildCashCycle(base: CollectionsResult, dds: DdsResult, moneyAtMonthEnd: number[]): CashCycleResult {
  const idx = new Map(dds.months.map((m, i) => [m, i]));
  const cells = dds.sections.flatMap(s => s.rows).filter(r => r.key !== PAYMENT_CATEGORY && r.key !== REFUND_CATEGORY);
  const otherIn: number[] = [], spent: number[] = [], net: number[] = [], closing: number[] = [], shortfall: boolean[] = [];
  base.months.forEach((m, k) => {
    const i = idx.get(m);
    if (i === undefined) { otherIn.push(0); spent.push(0); net.push(0); closing.push(NaN); shortfall.push(false); return; }
    let inn = 0, out = 0;
    for (const r of cells) { const v = r.values[i] || 0; if (v > 0) inn += v; else out += -v; }
    otherIn.push(inn); spent.push(out); net.push(dds.netFlow.values[i] || 0); closing.push(moneyAtMonthEnd[i]);
    shortfall.push(base.received[k] < out);
  });
  return { ...base, otherIn, spent, net, closing, shortfall, totalsCycle: { otherIn: sum(otherIn), spent: sum(spent), net: sum(net) } };
}
