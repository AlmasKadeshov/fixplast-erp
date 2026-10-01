// ОПиУ: выручка и себестоимость по начислению, опер. расходы по факту оплаты.
// Порт buildOPIU() из GAS без изменения логики.
import type { ReportInput, ReportRow } from './types';
import { OPEX_CATEGORY_ORDER, OPIU_EXCLUDED_CATEGORIES, INCOME_CATEGORIES, PERIOD_START } from './config';
import { monthKey, monthLabel } from './dates';
import { extractPackMultiplier, mapProductToCost, PEREKUP_MARK } from './products';
import { buildCostMaps, calcProductCost } from './cost';
import { sumAmortForPeriod } from './amortization';
import { cashExpensesAndIncomes, perekupByMonth } from './cashOps';

export interface OpiuResult {
  months: string[];
  labels: string[];
  rows: ReportRow[];
  /** Позиции без граммовок, посчитанные по ручной цене (перекуп) — для контроля */
  fallbackCost: Record<string, Record<string, { qty: number; sum: number }>>;
  totals: {
    revenueNet: number; grossProfit: number; opex: number; operatingProfit: number;
    grossMarginPct: number; operatingMarginPct: number;
  };
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

export interface OpiuOptions {
  /** 'monthly' — по помесячным ценам сырья (по умолчанию); 'static' — по готовой колонке «Себес» справочника */
  costMode?: 'monthly' | 'static';
}

export function buildOpiu(input: ReportInput, opts: OpiuOptions = {}): OpiuResult {
  const costMode = opts.costMode ?? 'monthly';
  const { bank, sales, settings } = input;
  const { costMap, weightsMap } = buildCostMaps(settings);

  const monthsSet = new Set<string>();
  const salesByMonth: Record<string, { revenue: number; nds: number; revenueNet: number; cost: number; qty: number }> = {};
  const expensesByMonth: Record<string, Record<string, number>> = {};
  const fallbackCost: OpiuResult['fallbackCost'] = {};

  for (const s of sales) {
    const p = s.period;
    monthsSet.add(p);
    const m = (salesByMonth[p] ||= { revenue: 0, nds: 0, revenueNet: 0, cost: 0, qty: 0 });
    m.revenue += s.amountWithNds;
    m.nds += s.nds;
    m.revenueNet += s.amountNet;
    m.qty += s.qty;

    const costName = mapProductToCost(s.product);
    if (costName && costName !== PEREKUP_MARK && costMap[costName]) {
      const pack = extractPackMultiplier(s.product);
      const w = costMode === 'monthly' ? weightsMap[costName] : undefined;
      const unit = w
        ? calcProductCost(costName, w, p, settings.priceHistory, settings.materialSplit, settings.staticPrices)
        : costMap[costName];
      m.cost += unit * s.qty * pack;
      if (!w) {
        const f = ((fallbackCost[p] ||= {})[costName] ||= { qty: 0, sum: 0 });
        f.qty += s.qty * pack;
        f.sum += unit * s.qty * pack;
      }
    }
  }

  // Опер. расходы из банка: всё кроме переводов, поступлений и исключённых статей
  for (const row of bank) {
    const cat = row.category;
    if (cat === 'Внутренний перевод') continue;
    if (INCOME_CATEGORIES.includes(cat)) continue;
    if (OPIU_EXCLUDED_CATEGORIES.includes(cat)) continue;
    const mk = monthKey(row.date);
    if (mk < PERIOD_START) continue;
    monthsSet.add(mk);
    const amount = row.amountKzt || row.amount || 0;
    const e = (expensesByMonth[mk] ||= {});
    e[cat] = (e[cat] || 0) + amount;
  }

  // Расходы из кассы
  for (const cop of cashExpensesAndIncomes(input.cash)) {
    if (cop.amount >= 0) continue;
    if (OPIU_EXCLUDED_CATEGORIES.includes(cop.category)) continue;
    if (cop.month < PERIOD_START) continue;
    monthsSet.add(cop.month);
    const e = (expensesByMonth[cop.month] ||= {});
    e[cop.category] = (e[cop.category] || 0) + Math.abs(cop.amount);
  }

  const perekup = perekupByMonth(input.bank, input.cash);
  const zpProd = settings.zpProduction;
  const kommun = settings.utilitiesPlant;
  const zpOffice = settings.zpOffice;
  const bonus = settings.managerBonuses;
  for (const src of [perekup, zpProd, kommun, zpOffice, bonus]) {
    for (const mk of Object.keys(src)) if (mk >= PERIOD_START) monthsSet.add(mk);
  }

  const months = [...monthsSet].filter(Boolean).sort();
  const labels = months.map(monthLabel);
  const line = (key: string, label: string, values: number[], kind: ReportRow['kind'] = 'line'): ReportRow =>
    ({ key, label, values, total: sum(values), kind });

  const rows: ReportRow[] = [];
  const rev = months.map(m => salesByMonth[m]?.revenue || 0);
  const nds = months.map(m => -(salesByMonth[m]?.nds || 0));
  const revNet = months.map(m => salesByMonth[m]?.revenueNet || 0);
  const costRaw = months.map(m => -(salesByMonth[m]?.cost || 0));
  const perekupV = months.map(m => -(perekup[m] || 0));
  const zpProdV = months.map(m => -(zpProd[m] || 0));
  const kommunV = months.map(m => -(kommun[m] || 0));
  const costFull = months.map((_, i) => costRaw[i] + perekupV[i] + zpProdV[i] + kommunV[i]);
  const gp = months.map((_, i) => revNet[i] + costFull[i]);

  rows.push(line('revenue', 'Выручка (с НДС)', rev));
  rows.push(line('nds', 'НДС', nds));
  rows.push(line('revenueNet', 'ВЫРУЧКА (без НДС)', revNet, 'subtotal'));
  rows.push(line('costRaw', 'Себестоимость производства (сырьё)', costRaw));
  rows.push(line('costPerekup', 'Себестоимость (Перекуп)', perekupV));
  rows.push(line('zpProd', 'ЗП производства', zpProdV));
  rows.push(line('kommun', 'Коммунальные завода', kommunV));
  rows.push(line('grossProfit', 'ВАЛОВАЯ ПРИБЫЛЬ', gp, 'subtotal'));
  const revNetTotal = sum(revNet), gpTotal = sum(gp);
  const gpPct = months.map((_, i) => (revNet[i] > 0 ? Math.round((gp[i] / revNet[i]) * 100) : 0));
  rows.push({ key: 'grossMargin', label: 'Маржа валовая (%)', values: gpPct, total: revNetTotal > 0 ? Math.round((gpTotal / revNetTotal) * 100) : 0, kind: 'percent' });

  // Опер. расходы
  const opexTotal = new Array(months.length).fill(0) as number[];
  const opexRows: ReportRow[] = [];
  const addOpex = (key: string, label: string, vals: number[]) => {
    vals.forEach((v, i) => { opexTotal[i] += v; });
    if (sum(vals) !== 0) opexRows.push(line(key, label, vals));
  };
  addOpex('zpOffice', 'ЗП офиса', months.map(m => -(zpOffice[m] || 0)));
  addOpex('bonuses', 'Бонусы менеджеров', months.map(m => -(bonus[m] || 0)));

  const allCats = new Set<string>();
  months.forEach(m => Object.keys(expensesByMonth[m] || {}).forEach(c => allCats.add(c)));
  const ordered = [...OPEX_CATEGORY_ORDER];
  allCats.forEach(c => { if (!ordered.includes(c)) ordered.push(c); });
  for (const cat of ordered) {
    if (!allCats.has(cat)) continue;
    addOpex(`opex:${cat}`, cat, months.map(m => -(expensesByMonth[m]?.[cat] || 0)));
  }
  const opexGrand = sum(opexTotal);
  rows.push({ key: 'opexHeader', label: 'ОПЕРАЦИОННЫЕ РАСХОДЫ (банк + касса, по факту оплаты)', values: [], total: 0, kind: 'header' });
  rows.push(...opexRows);
  rows.push(line('opexTotal', 'Итого операционные расходы', opexTotal, 'total'));

  const amort = months.map(m => -sumAmortForPeriod(settings.assets, m));
  if (sum(amort) !== 0) rows.push(line('amort', 'Амортизация ОС', amort));

  const op = months.map((_, i) => gp[i] + opexTotal[i] + amort[i]);
  const opTotal = sum(op);
  rows.push(line('operatingProfit', 'ОПЕРАЦИОННАЯ ПРИБЫЛЬ', op, 'subtotal'));
  rows.push({
    key: 'operatingMargin', label: 'Маржа операционная (%)',
    values: months.map((_, i) => (revNet[i] > 0 ? Math.round((op[i] / revNet[i]) * 100) : 0)),
    total: revNetTotal > 0 ? Math.round((opTotal / revNetTotal) * 100) : 0, kind: 'percent',
  });

  return {
    months, labels, rows, fallbackCost,
    totals: {
      revenueNet: revNetTotal, grossProfit: gpTotal, opex: opexGrand, operatingProfit: opTotal,
      grossMarginPct: revNetTotal > 0 ? (gpTotal / revNetTotal) * 100 : 0,
      operatingMarginPct: revNetTotal > 0 ? (opTotal / revNetTotal) * 100 : 0,
    },
  };
}
