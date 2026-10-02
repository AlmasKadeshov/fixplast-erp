// Табель производства из файла «ТАБЕЛ2026.xlsx»: по листу на месяц (рабочие) и отдельный лист ИТР.
// Колонки ищем по заголовкам, потому что в старых месяцах их набор и порядок отличаются.

export interface ProdWorker {
  no: number; name: string; role: string; rate: number;
  days: string;          // коды дней через запятую: д, н, о, б, д/2 (31 значение, пустые — «»)
  shifts: number; sick: number; rest: number;
  accrued: number;       // начисление
  carry: number;         // остаток с прошлого месяца
  bonus: number; penalty: number;
  toPay: number;         // итого к выплате
  paid: number;          // аванс / выплачено
  balance: number;       // остаток
}

export interface ItrEmployee {
  no: number; name: string; role: string;
  salary: number; deduction: number; bonus: number; toPay: number; paid: number; balance: number;
}

export interface ProdMonth { month: string; workers: ProdWorker[]; itr: ItrEmployee[] }
export interface ProdPayroll { months: ProdMonth[] }

type Row = unknown[];
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0);
const str = (v: unknown) => (v == null ? '' : String(v).trim());
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const MONTH_PREFIX: [string, string][] = [
  ['январ', '01'], ['феврал', '02'], ['март', '03'], ['апрел', '04'], ['май', '05'], ['июн', '06'],
  ['июл', '07'], ['август', '08'], ['сентябр', '09'], ['октябр', '10'], ['ноябр', '11'], ['декабр', '12'],
];
const SKIP = /^(касса|штат|эл|ангар)/;

/** «сентябрь2026 » → 2026-09; листы кассы, штата и пр. → null */
export function sheetMonth(name: string, year = 2026): { month: string; itr: boolean } | null {
  const n = norm(name);
  if (SKIP.test(n)) return null;
  const hit = MONTH_PREFIX.find(([p]) => n.startsWith(p));
  if (!hit) return null;
  return { month: `${year}-${hit[1]}`, itr: n.includes('итр') };
}

const findCol = (header: Row, ...needles: string[]) => header.findIndex(h => { const s = str(h).toLowerCase(); return needles.some(n => s.includes(n)); });

function parseWorkers(rows: Row[]): ProdWorker[] {
  const hi = rows.findIndex(r => str(r[0]) === '№' && /фио/i.test(str(r[1])));
  if (hi < 0) return [];
  const h = rows[hi];
  const c = {
    role: findCol(h, 'должност', 'долж'), rate: findCol(h, 'ставка'), shifts: findCol(h, 'кол-во смен'), sick: findCol(h, 'больн'), rest: findCol(h, 'отдых'),
    accrued: findCol(h, 'начислен'), carry: findCol(h, 'остаток с прошл'), bonus: findCol(h, 'премия'), penalty: findCol(h, 'штраф'),
    toPay: findCol(h, 'итого к выплат'), paid: findCol(h, 'аванс', 'выплачено'), balance: h.map(x => str(x).toLowerCase()).lastIndexOf('остаток'),
  };
  const dayCols = h.map((v, i) => (typeof v === 'number' && v >= 1 && v <= 31 ? i : -1)).filter(i => i >= 0);
  const out: ProdWorker[] = [];
  for (const r of rows.slice(hi + 1)) {
    const name = str(r[1]);
    if (!name || typeof r[0] !== 'number') { if (out.length && !name) break; continue; }
    const at = (i: number) => (i >= 0 ? num(r[i]) : 0);
    out.push({
      no: num(r[0]), name, role: c.role >= 0 ? str(r[c.role]) : '', rate: at(c.rate),
      days: dayCols.map(i => str(r[i])).join(','),
      shifts: at(c.shifts), sick: at(c.sick), rest: at(c.rest), accrued: at(c.accrued), carry: at(c.carry),
      bonus: at(c.bonus), penalty: at(c.penalty), toPay: at(c.toPay), paid: at(c.paid), balance: at(c.balance),
    });
  }
  return out;
}

function parseItr(rows: Row[]): ItrEmployee[] {
  const hi = rows.findIndex(r => str(r[0]) === '№' && /фио/i.test(str(r[1])));
  if (hi < 0) return [];
  const h = rows[hi];
  const c = { role: findCol(h, 'долж'), salary: findCol(h, 'зарплат'), ded: findCol(h, 'удержан'), bonus: findCol(h, 'премия'), toPay: findCol(h, 'к уплате', 'к выплате'), paid: findCol(h, 'выплачено'), bal: findCol(h, 'остаток') };
  const out: ItrEmployee[] = [];
  for (const r of rows.slice(hi + 1)) {
    const name = str(r[1]);
    if (!name || typeof r[0] !== 'number') { if (out.length && !name) break; continue; }
    const at = (i: number) => (i >= 0 ? num(r[i]) : 0);
    out.push({ no: num(r[0]), name, role: c.role >= 0 ? str(r[c.role]) : '', salary: at(c.salary), deduction: at(c.ded), bonus: at(c.bonus), toPay: at(c.toPay), paid: at(c.paid), balance: at(c.bal) });
  }
  return out;
}

export function parseTabel(sheets: { name: string; rows: Row[] }[]): ProdPayroll {
  const byMonth = new Map<string, ProdMonth>();
  for (const s of sheets) {
    const m = sheetMonth(s.name);
    if (!m) continue;
    const cur = byMonth.get(m.month) ?? { month: m.month, workers: [], itr: [] };
    if (m.itr) cur.itr = parseItr(s.rows); else cur.workers = parseWorkers(s.rows);
    byMonth.set(m.month, cur);
  }
  const months = [...byMonth.values()].filter(m => m.workers.length || m.itr.length).sort((a, b) => a.month.localeCompare(b.month));
  return { months };
}
