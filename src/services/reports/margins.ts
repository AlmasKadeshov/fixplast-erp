// Маржинальность по продуктам: выручка без НДС минус себестоимость сырья по граммовкам (та же логика, что в ОПиУ).
// Это «маржа по сырью»: ЗП производства, коммунальные и перекуп в неё не входят.
import type { ReportInput } from './types';
import { buildCostMaps, calcProductCost } from './cost';
import { extractPackMultiplier, getProductGroup, mapProductToCost, PEREKUP_MARK, shortProductName } from './products';

export interface ProductMargin {
  key: string;
  name: string;
  group: string;
  qty: number;         // штук с учётом упаковок
  revenue: number;     // выручка без НДС
  costed: number;      // часть выручки, по которой известна себестоимость
  cost: number;        // себестоимость сырья
  margin: number;      // costed − cost
  marginPct: number | null;   // null — себестоимость не найдена
  unitPrice: number;   // средняя цена продажи без НДС за шт
  unitCost: number | null;    // средняя себестоимость за шт
}

export interface MarginsResult {
  periods: string[];
  rows: ProductMargin[];
  totals: { revenue: number; costed: number; cost: number; margin: number; marginPct: number; uncosted: number };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** period — 'yyyy-MM' или 'all' */
export function buildProductMargins(input: ReportInput, period: string): MarginsResult {
  const { sales, settings } = input;
  const { costMap, weightsMap } = buildCostMaps(settings);
  const periods = [...new Set(sales.map(s => s.period))].filter(Boolean).sort();
  const acc = new Map<string, { name: string; group: string; qty: number; revenue: number; costed: number; cost: number; costedQty: number }>();

  for (const s of sales) {
    if (period !== 'all' && s.period !== period) continue;
    const full = clean(s.product);
    const key = full.toLowerCase();
    const a = acc.get(key) ?? { name: shortProductName(full), group: getProductGroup(full), qty: 0, revenue: 0, costed: 0, cost: 0, costedQty: 0 };
    const pack = extractPackMultiplier(s.product);
    const units = s.qty * pack;
    a.qty += units;
    a.revenue += s.amountNet;
    const costName = mapProductToCost(s.product);
    if (costName && costName !== PEREKUP_MARK && costMap[costName]) {
      const w = weightsMap[costName];
      const unit = w ? calcProductCost(costName, w, s.period, settings.priceHistory, settings.materialSplit, settings.staticPrices) : costMap[costName];
      a.cost += unit * units;
      a.costed += s.amountNet;
      a.costedQty += units;
    }
    acc.set(key, a);
  }

  const rows: ProductMargin[] = [...acc.entries()]
    .filter(([, a]) => Math.abs(a.revenue) >= 1 || a.qty > 0)
    .map(([key, a]) => {
      const known = a.revenue > 0 && a.costed / a.revenue >= 0.5;
      const margin = a.costed - a.cost;
      return {
        key, name: a.name, group: a.group, qty: a.qty, revenue: a.revenue, costed: a.costed, cost: a.cost, margin,
        marginPct: known && a.costed > 0 ? (margin / a.costed) * 100 : null,
        unitPrice: a.qty ? a.revenue / a.qty : 0,
        unitCost: known && a.costedQty ? a.cost / a.costedQty : null,
      };
    })
    .sort((x, y) => y.margin - x.margin);

  const sum = (f: (r: ProductMargin) => number) => rows.reduce((s, r) => s + f(r), 0);
  const revenue = sum(r => r.revenue), costed = sum(r => r.costed), cost = sum(r => r.cost);
  return { periods, rows, totals: { revenue, costed, cost, margin: costed - cost, marginPct: costed ? ((costed - cost) / costed) * 100 : 0, uncosted: revenue - costed } };
}
