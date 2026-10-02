// Разбор листов Google Sheets (как их отдаёт xlsx с raw:true, cellDates:true) в типы отчётов.
// Используется и импортом в приложении, и тестовой сверкой с эталонными листами.
import type {
  BankOp, CashOp, SaleRow, ReportSettings, BankBalance, ProductCostRow, MaterialPrices, MaterialSplit, FixedAssetAmort, StaffRow,
} from './types';
import { normalizePeriod, excelSerialToDate } from './dates';

type Row = unknown[];

const str = (v: unknown) => (v == null ? '' : String(v).trim());
export function toNum(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
/** Разумный диапазон: отсекает «206-10-…» и подобный мусор вместо тихой загрузки в 206 год */
export function isValidDate(d: Date): boolean {
  const y = d.getUTCFullYear();
  return !isNaN(d.getTime()) && y >= 2000 && y <= 2100;
}

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isValidDate(v) ? v : null;
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (!(v > 20000 && v < 80000)) return null; const d = excelSerialToDate(v); return isValidDate(d) ? d : null; }
  const s = String(v).trim();
  let d: Date;
  const dm = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) d = new Date(`${dm[3]}-${dm[2]}-${dm[1]}T00:00:00+05:00`);
  else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T00:00:00+05:00`);
  else d = new Date(s);
  return isValidDate(d) ? d : null;
}

/** Индексы колонок по названию заголовка (регистр и пробелы не важны) */
function headerIndex(header: Row): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((h, i) => {
    const k = str(h).toLowerCase().replace(/\s+/g, ' ');
    if (k && !(k in out)) out[k] = i;
  });
  return out;
}

export function parseBank(rows: Row[]): BankOp[] {
  const h = headerIndex(rows[0] || []);
  const c = (n: string, fb: number) => (h[n] !== undefined ? h[n] : fb);
  const iDate = c('дата', 0), iType = c('тип', 1), iAmt = c('сумма', 2), iCat = c('статья', 3),
    iCp = c('контрагент', 4), iPur = c('назначение', 5), iCo = c('компания', 6), iCur = c('валюта', 7), iKzt = c('сумма kzt', 8);
  const out: BankOp[] = [];
  for (const r of rows.slice(1)) {
    const date = toDate(r[iDate]);
    if (!date) continue;
    out.push({
      date, type: str(r[iType]).toLowerCase(), amount: toNum(r[iAmt]), category: str(r[iCat]),
      counterparty: str(r[iCp]), purpose: str(r[iPur]), company: str(r[iCo]),
      currency: str(r[iCur]) || 'KZT', amountKzt: toNum(r[iKzt]),
    });
  }
  return out;
}

export function parseCash(rows: Row[]): CashOp[] {
  const out: CashOp[] = [];
  for (const r of rows.slice(1)) {
    const date = toDate(r[0]);
    if (!date) continue;
    out.push({
      date, type: str(r[1]).toLowerCase(), walletFrom: str(r[2]), walletTo: str(r[3]),
      amount: toNum(r[4]), category: str(r[5]), comment: str(r[6]), section: str(r[7]),
    });
  }
  return out;
}

export function parseSalesLegal(rows: Row[]): SaleRow[] {
  const h = headerIndex(rows[0] || []);
  const hasManager = h['менеджер'] !== undefined;
  const out: SaleRow[] = [];
  for (const r of rows.slice(1)) {
    const period = normalizePeriod(r[0]);
    if (!period) continue;
    if (hasManager) {
      out.push({
        period, company: str(r[1]), manager: str(r[2]), client: str(r[3]), clientType: str(r[4]),
        product: str(r[5]), qty: toNum(r[6]), retQty: toNum(r[7]),
        amountWithNds: toNum(r[8]), nds: toNum(r[9]), amountNet: toNum(r[10]), source: 'юр.лица',
      });
    } else {
      out.push({
        period, company: str(r[1]), manager: '', client: str(r[2]), clientType: '',
        product: str(r[3]), qty: toNum(r[4]), retQty: toNum(r[5]),
        amountWithNds: toNum(r[6]), nds: toNum(r[7]), amountNet: toNum(r[8]), source: 'юр.лица',
      });
    }
  }
  return out;
}

/** Физлица: колонки Период | Компания | Менеджер | Контрагент | Номенклатура | Кол-во | Сумма | Цена. НДС нет. */
export function parseSalesPhysical(rows: Row[]): SaleRow[] {
  const out: SaleRow[] = [];
  for (const r of rows.slice(1)) {
    const period = normalizePeriod(r[0]);
    if (!period) continue;
    const amount = toNum(r[6]);
    out.push({
      period, company: str(r[1]), manager: str(r[2]), client: str(r[3]), clientType: '',
      product: str(r[4]), qty: toNum(r[5]), retQty: 0,
      amountWithNds: amount, nds: 0, amountNet: amount, source: 'физ.лица',
    });
  }
  return out;
}

/** Лист «Себестоимость»: B2:B4 цены, затем справочник от заголовка «Продукция», затем таблица % состава */
export function parseCostSheet(rows: Row[]) {
  const staticPrices = { pnd: toNum(rows[1]?.[1]), metall: toNum(rows[2]?.[1]), poliamid: toNum(rows[3]?.[1]) };

  let start = 6;
  for (let i = 0; i < rows.length; i++) {
    if (str(rows[i]?.[0]).toLowerCase() === 'продукция') { start = i + 1; break; }
  }
  const productCosts: ProductCostRow[] = [];
  for (let i = start; i < rows.length; i++) {
    const name = str(rows[i]?.[0]);
    if (!name) continue;
    if (name.toLowerCase() === 'категория') break;
    productCosts.push({
      name, metall: toNum(rows[i][1]), poliamid: toNum(rows[i][2]), pnd: toNum(rows[i][3]), cost: toNum(rows[i][4]),
    });
  }

  const materialSplit: Record<string, MaterialSplit> = {};
  let hdr = -1;
  for (let i = 0; i < rows.length; i++) {
    if (str(rows[i]?.[0]).toLowerCase() === 'категория') { hdr = i; break; }
  }
  if (hdr >= 0) {
    for (let i = hdr + 1; i < rows.length; i++) {
      const name = str(rows[i]?.[0]);
      if (!name) break;
      materialSplit[name] = { pnd: toNum(rows[i][1]) / 100, pp: toNum(rows[i][2]) / 100, pvd: toNum(rows[i][3]) / 100 };
    }
  }
  return { staticPrices, productCosts, materialSplit };
}

/** «Цены_Сырья_История»: пустые ячейки переносятся вперёд от последней известной цены */
export function parsePriceHistory(rows: Row[]): Record<string, MaterialPrices> {
  const keys: (keyof MaterialPrices)[] = ['pnd', 'metall', 'poliamid', 'pp', 'pvd'];
  const last: MaterialPrices = { pnd: null, metall: null, poliamid: null, pp: null, pvd: null };
  const out: Record<string, MaterialPrices> = {};
  for (const r of rows.slice(1)) {
    const period = normalizePeriod(r[0]);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const entry = { ...last };
    keys.forEach((k, i) => {
      const raw = r[i + 1];
      if (raw === '' || raw == null || isNaN(Number(raw))) { entry[k] = last[k]; }
      else { entry[k] = Number(raw); last[k] = Number(raw); }
    });
    out[period] = entry;
  }
  return out;
}

/** Помесячные листы (ЗП, бонусы, коммунальные): A = период, valueCol = значение */
export function parseMonthly(rows: Row[], valueCol: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows.slice(1)) {
    const period = normalizePeriod(r[0]);
    if (!/^\d{4}-\d{2}$/.test(period)) continue;
    const v = toNum(r[valueCol]);
    if (!v) continue;
    out[period] = (out[period] || 0) + v;
  }
  return out;
}

/** «ОС_справочник»: № | … | E дата ввода | … | H мес. амортизация */
export function parseAssets(rows: Row[]): FixedAssetAmort[] {
  const out: FixedAssetAmort[] = [];
  for (const r of rows.slice(1)) {
    if (typeof r[0] !== 'number' || !isFinite(r[0])) continue;
    const amort = toNum(r[7]);
    if (!amort) continue;
    out.push({ amort, date: toDate(r[4]) });
  }
  return out;
}

/** «Остатки»: Компания | Валюта | Банк | Период с | Период по | Вх.остаток | Исх.остаток */
export function parseBankBalances(rows: Row[]): BankBalance[] {
  const out: BankBalance[] = [];
  const hasBank = (rows[0]?.length || 0) >= 7;
  const idxOut = hasBank ? 6 : 5;
  for (const r of rows.slice(1)) {
    const company = str(r[0]);
    if (!company) continue;
    out.push({ company, currency: str(r[1]), bank: hasBank ? str(r[2]) || 'Jusan' : 'Jusan', amount: toNum(r[idxOut]) });
  }
  return out;
}

/** «Кошельки»: A = название, B = начальный остаток */
export function parseWalletInitial(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows.slice(1)) {
    const name = str(r[0]);
    if (name) out[name] = toNum(r[1]);
  }
  return out;
}

/** «ОФИС_ЗП_данные»: № | Сотрудники | Оклад по неофиц. | Оклад офиц. | Оклад (итого) */
export function parseStaff(rows: Row[]): StaffRow[] {
  const out: StaffRow[] = [];
  for (const r of rows.slice(1)) {
    const name = str(r[1]);
    if (!name) continue;
    const unofficial = toNum(r[2]), official = toNum(r[3]);
    out.push({ no: toNum(r[0]), name, unofficial, official, total: toNum(r[4]) || unofficial + official });
  }
  return out;
}

export function buildSettings(sheets: {
  cost: Row[]; prices: Row[]; zpProd: Row[]; zpOffice: Row[]; bonuses: Row[]; utilities: Row[]; assets: Row[];
  balances?: Row[]; wallets?: Row[]; staff?: Row[];
}): ReportSettings {
  const c = parseCostSheet(sheets.cost);
  return {
    ...c,
    priceHistory: parsePriceHistory(sheets.prices),
    zpProduction: parseMonthly(sheets.zpProd, 3),
    zpOffice: parseMonthly(sheets.zpOffice, 1),
    managerBonuses: parseMonthly(sheets.bonuses, 1),
    utilitiesPlant: parseMonthly(sheets.utilities, 3),
    assets: parseAssets(sheets.assets),
    bankBalances: sheets.balances ? parseBankBalances(sheets.balances) : [],
    walletInitial: sheets.wallets ? parseWalletInitial(sheets.wallets) : {},
    staff: sheets.staff ? parseStaff(sheets.staff) : [],
  };
}
