// Проверки качества данных: что в файле не сопоставилось или потеряется в отчётах.
// Эти же ситуации в GAS молча давали занижение/пропуск — здесь их показываем.
import type { ReportInput } from './types';
import { DDS_SECTIONS, OPIU_EXCLUDED_CATEGORIES, PERIOD_START } from './config';
import { monthKey } from './dates';
import { mapProductToCost, PEREKUP_MARK } from './products';
import { buildCostMaps } from './cost';

export interface Issue {
  level: 'error' | 'warn' | 'info';
  title: string;
  detail?: string;
  amount?: number;
}

const ALL_DDS_CATEGORIES = new Set(Object.values(DDS_SECTIONS).flat());

export function validateInput(input: ReportInput): Issue[] {
  const issues: Issue[] = [];
  const { bank, cash, sales, settings } = input;

  if (!bank.length) issues.push({ level: 'error', title: 'В листе «Журнал_Банк» нет операций' });
  if (!sales.length) issues.push({ level: 'error', title: 'В листах продаж нет строк' });

  // Банк без статьи — не попадёт ни в ДДС, ни в ОПиУ нужной строкой
  const noCat = bank.filter(b => !b.category);
  if (noCat.length) {
    issues.push({
      level: 'warn', title: `Банк: ${noCat.length} операций без статьи`,
      detail: 'Проставьте статью в «Журнал_Банк» — иначе сумма не попадёт в нужную строку ДДС.',
      amount: noCat.reduce((s, b) => s + Math.abs(b.amountKzt || b.amount), 0),
    });
  }

  // Статьи, которых нет в ДДС: сумма исчезает из ДДС (в ОПиУ они попадают в опер. расходы)
  const lost = new Map<string, number>();
  for (const b of bank) {
    if (!b.category || b.category === 'Внутренний перевод' || ALL_DDS_CATEGORIES.has(b.category)) continue;
    if (monthKey(b.date) < PERIOD_START) continue;
    lost.set(b.category, (lost.get(b.category) || 0) + Math.abs(b.amountKzt || b.amount));
  }
  for (const c of cash) {
    const cat = c.category.trim();
    if (!cat || c.type === 'перевод' || cat === 'Внутренний перевод' || ALL_DDS_CATEGORIES.has(cat)) continue;
    if (monthKey(c.date) < PERIOD_START) continue;
    lost.set(cat, (lost.get(cat) || 0) + Math.abs(c.amount));
  }
  for (const [cat, amt] of [...lost].sort((a, b) => b[1] - a[1])) {
    issues.push({
      level: 'warn', title: `Статья «${cat}» не входит в ДДС`, amount: amt,
      detail: OPIU_EXCLUDED_CATEGORIES.includes(cat) ? undefined : 'В ОПиУ учтена в операционных расходах, в ДДС — нет.',
    });
  }

  // Товары 1С без строки в справочнике себестоимости → себестоимость занижена
  const { costMap } = buildCostMaps(settings);
  const unmapped = new Map<string, number>();
  for (const s of sales) {
    const cn = mapProductToCost(s.product);
    if (cn === PEREKUP_MARK) continue;
    if (cn && costMap[cn]) continue;
    unmapped.set(s.product, (unmapped.get(s.product) || 0) + s.amountNet);
  }
  if (unmapped.size) {
    const total = [...unmapped.values()].reduce((s, v) => s + v, 0);
    const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n).join('; ');
    issues.push({
      level: 'warn', title: `Себестоимость не найдена для ${unmapped.size} позиций 1С`, amount: total,
      detail: `Продажи есть, а в справочнике «Себестоимость» нет цены — маржа завышена. Крупнейшие: ${top}`,
    });
  }

  // Месяцы цен сырья
  const priceMonths = new Set(Object.keys(settings.priceHistory));
  const salesMonths = [...new Set(sales.map(s => s.period))].filter(p => p >= PERIOD_START).sort();
  const noPrice = salesMonths.filter(m => !priceMonths.has(m));
  if (noPrice.length) {
    issues.push({ level: 'warn', title: `Нет цен сырья за: ${noPrice.join(', ')}`, detail: 'Для этих месяцев себестоимость считается по статичным ценам листа «Себестоимость».' });
  }
  const noOverheads = salesMonths.filter(m => !settings.zpProduction[m] || !settings.utilitiesPlant[m]);
  if (noOverheads.length) {
    issues.push({ level: 'warn', title: `Нет ЗП производства или коммунальных за: ${noOverheads.join(', ')}`, detail: 'Валовая прибыль этих месяцев завышена.' });
  }

  if (!settings.bankBalances.length) issues.push({ level: 'warn', title: 'Лист «Остатки» пуст — остатки по банку не покажутся' });
  return issues;
}

export interface DataSummary {
  bank: { count: number; from: string; to: string };
  cash: { count: number; from: string; to: string };
  sales: { count: number; from: string; to: string; revenueNet: number };
}

export function summarize(input: ReportInput): DataSummary {
  const range = (dates: Date[]) => {
    if (!dates.length) return { from: '—', to: '—' };
    const t = dates.map(d => d.getTime());
    return { from: monthKey(new Date(Math.min(...t))), to: monthKey(new Date(Math.max(...t))) };
  };
  const periods = input.sales.map(s => s.period).filter(Boolean).sort();
  return {
    bank: { count: input.bank.length, ...range(input.bank.map(b => b.date)) },
    cash: { count: input.cash.length, ...range(input.cash.map(c => c.date)) },
    sales: { count: input.sales.length, from: periods[0] || '—', to: periods[periods.length - 1] || '—', revenueNet: input.sales.reduce((s, r) => s + r.amountNet, 0) },
  };
}
