// ДДС: движение денег (банк + касса) по трём видам деятельности.
// Порт buildDDS() из GAS. Знак — по направлению операции (приход/расход).
import type { ReportInput, ReportRow } from './types';
import { DDS_SECTIONS, PERIOD_START, SECTION_NUMBERS } from './config';
import { currentMonthKey, monthKey, monthLabel } from './dates';
import { cashExpensesAndIncomes, type FlowOp } from './cashOps';

export interface DdsSection { name: string; number: string; rows: ReportRow[]; total: ReportRow }
export interface DdsResult {
  months: string[];
  labels: string[];
  sections: DdsSection[];
  netFlow: ReportRow;
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export function buildDds(input: ReportInput, periodEnd: string = currentMonthKey()): DdsResult {
  const ops: FlowOp[] = [];
  const monthsSet = new Set<string>();

  for (const r of input.bank) {
    if (r.category === 'Внутренний перевод') continue;
    const mk = monthKey(r.date);
    if (mk < PERIOD_START || mk > periodEnd) continue;
    monthsSet.add(mk);
    const amount = r.amountKzt || r.amount || 0;
    ops.push({ month: mk, category: r.category, amount: amount * (r.type.trim().toLowerCase() === 'приход' ? 1 : -1) });
  }
  for (const c of cashExpensesAndIncomes(input.cash)) {
    if (c.month < PERIOD_START || c.month > periodEnd) continue;
    monthsSet.add(c.month);
    ops.push(c);
  }

  const months = [...monthsSet].sort();
  // Свёртка: category → month → сумма
  const byCat = new Map<string, Map<string, number>>();
  for (const o of ops) {
    let m = byCat.get(o.category);
    if (!m) byCat.set(o.category, (m = new Map()));
    m.set(o.month, (m.get(o.month) || 0) + o.amount);
  }

  const sections: DdsSection[] = [];
  const secTotals: number[][] = [];
  for (const [name, cats] of Object.entries(DDS_SECTIONS)) {
    const rows: ReportRow[] = [];
    const secMonths = new Array(months.length).fill(0) as number[];
    for (const cat of cats) {
      const m = byCat.get(cat);
      const values = months.map(mk => m?.get(mk) || 0);
      values.forEach((v, i) => { secMonths[i] += v; });
      if (values.every(v => v === 0)) continue;
      rows.push({ key: cat, label: cat, values, total: sum(values), kind: 'line' });
    }
    secTotals.push(secMonths);
    sections.push({
      name, number: SECTION_NUMBERS[name], rows,
      total: { key: `total:${name}`, label: `Итого ${name.toLowerCase()}`, values: secMonths, total: sum(secMonths), kind: 'total' },
    });
  }

  const net = months.map((_, i) => secTotals.reduce((s, t) => s + t[i], 0));
  return {
    months, labels: months.map(monthLabel), sections,
    netFlow: { key: 'netFlow', label: 'ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК', values: net, total: sum(net), kind: 'total' },
  };
}
