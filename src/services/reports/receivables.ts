// Дебиторка из отчёта 1С «Оборотно-сальдовая ведомость по счёту 1210» (по контрагентам, строки «БУ»).
// «Свои компании» (родственные стороны) считаются отдельно и в долг внешних покупателей не входят.

export interface ArRow {
  name: string;
  manager?: string; // «01 Данияр» — группа в отчёте 1С
  openD: number; openC: number;   // сальдо на начало
  turnD: number; turnC: number;   // обороты: отгрузки / оплаты и зачёты
  closeD: number; closeC: number; // сальдо на конец
}

export interface ArReport {
  company: string;
  title: string;   // «Оборотно-сальдовая ведомость по счету 1210 за 9 месяцев 2026 г.»
  rows: ArRow[];
}

type Row = unknown[];
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
const str = (v: unknown) => (v == null ? '' : String(v).trim());

const MANAGER_RE = /^\d{2}\s+\S/;

// levels — уровень вложенности строк Excel (группировка 1С): 2 = менеджер/группа, 3 = клиент. Без него менеджер ищется по номеру «01 Имя».
export function parseOsv1210(rows: Row[], levels?: (number | undefined)[]): ArReport {
  const out: ArRow[] = [];
  let manager = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Два формата выгрузки: показатель «БУ» во 2-й колонке (старый) или в 3-й (с группировкой по менеджерам).
    const ind = str(r[1]) === 'БУ' ? 1 : str(r[2]) === 'БУ' ? 2 : 0;
    if (!ind) continue;
    const name = str(r[0]);
    const lvl = levels?.[i];
    if (!name || name === '1210') continue;
    if (/^итого$/i.test(name)) break;
    if (lvl === 1 || name === 'Покупатели') { manager = ''; continue; }
    if (lvl ? lvl === 2 : MANAGER_RE.test(name)) { manager = name; continue; }
    const o = ind + 1;
    out.push({ name, manager: manager || undefined, openD: num(r[o]), openC: num(r[o + 1]), turnD: num(r[o + 2]), turnC: num(r[o + 3]), closeD: num(r[o + 4]), closeC: num(r[ind === 1 ? 8 : o + 5]) });
  }
  return { company: str(rows[0]?.[0]), title: str(rows[1]?.[0]), rows: out };
}

export const DEFAULT_RELATED = ['Мир строительных материалов', 'Каусар', 'Stonex', 'Сатымбеков'];

export const isRelated = (name: string, related: string[]) => {
  const n = name.toLowerCase();
  return related.some(r => r.trim() && n.includes(r.trim().toLowerCase()));
};

export const arBalance = (r: ArRow, at: 'open' | 'close' = 'close') => (at === 'close' ? r.closeD - r.closeC : r.openD - r.openC);

export interface ArSummary {
  open: number; close: number; growth: number; shipped: number; paid: number;
  debtors: number; advances: number;
  top3Pct: number; top5Pct: number; top10Pct: number;
  newDebtors: { count: number; sum: number };
  small: { count: number; sum: number };
}

const sumBy = (a: ArRow[], f: (r: ArRow) => number) => a.reduce((s, r) => s + f(r), 0);

export function summarizeAr(rows: ArRow[]): ArSummary {
  const debtors = rows.filter(r => arBalance(r) > 0.5).sort((a, b) => arBalance(b) - arBalance(a));
  const dSum = sumBy(debtors, r => arBalance(r)) || 1;
  const topPct = (n: number) => (sumBy(debtors.slice(0, n), r => arBalance(r)) / dSum) * 100;
  const fresh = debtors.filter(r => arBalance(r, 'open') < 1e5 && arBalance(r) > 1e6);
  const small = debtors.filter(r => arBalance(r) < 1e6);
  const open = sumBy(rows, r => arBalance(r, 'open')), close = sumBy(rows, r => arBalance(r));
  return {
    open, close, growth: close - open, shipped: sumBy(rows, r => r.turnD), paid: sumBy(rows, r => r.turnC),
    debtors: debtors.length, advances: -sumBy(rows.filter(r => arBalance(r) < -0.5), r => arBalance(r)),
    top3Pct: topPct(3), top5Pct: topPct(5), top10Pct: topPct(10),
    newDebtors: { count: fresh.length, sum: sumBy(fresh, r => arBalance(r)) },
    small: { count: small.length, sum: sumBy(small, r => arBalance(r)) },
  };
}

export const NO_MANAGER = 'Без менеджера';

export interface ManagerGroup {
  name: string;
  rows: ArRow[];           // внешние клиенты менеджера
  open: number; close: number; growth: number; shipped: number; paid: number;
  debtors: ArRow[];        // с долгом на конец, по убыванию
  share: number;           // доля от внешнего долга, %
  mineClose: number;       // долг своих компаний у этого менеджера (в итоги не входит)
}

// Менеджеры по убыванию долга. Свои компании в сумму менеджера не входят.
export function groupByManager(rows: ArRow[], related: string[]): ManagerGroup[] {
  const map = new Map<string, ArRow[]>();
  for (const r of rows) {
    const k = r.manager || NO_MANAGER;
    (map.get(k) ?? map.set(k, []).get(k)!).push(r);
  }
  const groups = [...map].map(([name, all]) => {
    const rs = all.filter(r => !isRelated(r.name, related));
    const open = sumBy(rs, r => arBalance(r, 'open')), close = sumBy(rs, r => arBalance(r));
    return {
      name, rows: rs, open, close, growth: close - open, shipped: sumBy(rs, r => r.turnD), paid: sumBy(rs, r => r.turnC),
      debtors: rs.filter(r => arBalance(r) > 0.5).sort((a, b) => arBalance(b) - arBalance(a)),
      share: 0, mineClose: sumBy(all.filter(r => isRelated(r.name, related)), r => arBalance(r)),
    };
  });
  const total = groups.reduce((s, g) => s + Math.max(g.close, 0), 0) || 1;
  groups.forEach(g => { g.share = (Math.max(g.close, 0) / total) * 100; });
  return groups.sort((a, b) => b.close - a.close);
}
