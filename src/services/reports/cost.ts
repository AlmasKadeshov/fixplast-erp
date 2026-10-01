// Себестоимость по составу изделия и помесячным ценам сырья (порт calcProductCost_ из GAS).
import type { MaterialPrices, MaterialSplit, ProductWeights, ReportSettings } from './types';
import { getCategoryForProduct } from './products';

const num = (v: number | null | undefined) => Number(v) || 0;

export function calcProductCost(
  product: string,
  weights: ProductWeights,
  period: string,
  priceHistory: Record<string, MaterialPrices>,
  splits: Record<string, MaterialSplit>,
  staticPrices: ReportSettings['staticPrices'],
): number {
  const pp: Partial<MaterialPrices> = priceHistory[period] || {};
  const pick = (v: number | null | undefined, fb: number) => (v !== null && v !== undefined ? v : fb);

  const metallPrice = pick(pp.metall, num(staticPrices.metall));
  const poliamidPrice = pick(pp.poliamid, num(staticPrices.poliamid));

  let cost = (num(weights.metall) / 1000) * metallPrice + (num(weights.poliamid) / 1000) * poliamidPrice;

  const category = getCategoryForProduct(product);
  const pndWeight = num(weights.pnd);

  if ((category === 'Дюбели' || category === 'Фиксаторы') && pndWeight > 0) {
    const split = splits[category] || { pnd: 0, pp: 0, pvd: 0 };
    const fallback = num(staticPrices.pnd);
    cost += (pndWeight * num(split.pnd) / 1000) * pick(pp.pnd, fallback);
    cost += (pndWeight * num(split.pp) / 1000) * pick(pp.pp, fallback);
    cost += (pndWeight * num(split.pvd) / 1000) * pick(pp.pvd, fallback);
  } else {
    cost += (pndWeight / 1000) * num(staticPrices.pnd);
  }
  return cost;
}

/** Карты справочника «Себестоимость»: готовая цена (costMap) и граммовки (weightsMap) */
export function buildCostMaps(settings: ReportSettings) {
  const costMap: Record<string, number> = {};
  const weightsMap: Record<string, ProductWeights> = {};
  for (const p of settings.productCosts) {
    if (p.name && p.cost > 0) costMap[p.name] = p.cost;
    // Только строки с реальными весами: перекуп (0/0/0) идёт по ручной цене из costMap
    if (p.name && (p.metall > 0 || p.poliamid > 0 || p.pnd > 0)) {
      weightsMap[p.name] = { metall: p.metall, poliamid: p.poliamid, pnd: p.pnd };
    }
  }
  return { costMap, weightsMap };
}
