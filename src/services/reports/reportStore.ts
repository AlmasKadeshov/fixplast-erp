// Хранение данных отчётов в Firestore.
// Операции лежат пачками по CHUNK строк в одном документе коллекции `reportData`
// (≈25 чтений на открытие отчёта вместо ~11 тысяч), настройки — отдельным документом.
// Импорт всегда заменяет данные целиком: источник правды — таблица.
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { BankOp, CashOp, ReportInput, ReportSettings, SaleRow } from './types';
import { DEFAULT_RELATED, type ArReport } from './receivables';
import type { ProdPayroll } from './payrollProd';

const COL = 'reportData';
const AR_DOC = 'receivables';
const RELATED_DOC = 'related';
const PROD_DOC = 'payrollProd';
const CHUNK = 400;

export interface ReportMeta {
  importedAt: number;
  importedBy: string;
  fileName: string;
  counts: { bank: number; cash: number; sales: number };
}

type Packed = Record<string, unknown>;

const packBank = (r: BankOp): Packed => ({ ...r, date: r.date.getTime() });
const unpackBank = (r: Packed): BankOp => ({ ...(r as unknown as BankOp), date: new Date(r.date as number) });
const packCash = (r: CashOp): Packed => ({ ...r, date: r.date.getTime() });
const unpackCash = (r: Packed): CashOp => ({ ...(r as unknown as CashOp), date: new Date(r.date as number) });

function packSettings(s: ReportSettings): Packed {
  return { ...s, assets: s.assets.map(a => ({ amort: a.amort, date: a.date ? a.date.getTime() : null })) };
}
function unpackSettings(p: Packed): ReportSettings {
  const s = p as unknown as ReportSettings & { assets: { amort: number; date: number | null }[] };
  return {
    ...s,
    assets: (s.assets || []).map(a => ({ amort: a.amort, date: a.date ? new Date(a.date) : null })),
    bankBalances: s.bankBalances || [],
    walletInitial: s.walletInitial || {},
    staff: s.staff || [],
  };
}

/** commit() у Firestore при проблемах со связью не отклоняется, а висит — не даём ждать вечно */
function withTimeout<T>(p: Promise<T>, what: string, ms = 40000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Сервер не ответил за ${ms / 1000} с (${what}). Проверьте интернет и блокировщики рекламы, затем повторите.`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function saveReportData(
  input: ReportInput,
  info: { importedBy: string; fileName: string },
  onProgress?: (done: number, total: number) => void,
): Promise<ReportMeta> {
  const docs: { id: string; data: Packed }[] = [];
  const addKind = (kind: string, rows: Packed[]) =>
    chunks(rows, CHUNK).forEach((rs, i) => docs.push({ id: `${kind}_${String(i).padStart(3, '0')}`, data: { kind, i, rows: rs } }));
  addKind('bank', input.bank.map(packBank));
  addKind('cash', input.cash.map(packCash));
  addKind('sales', input.sales as unknown as Packed[]);

  const meta: ReportMeta = {
    importedAt: Date.now(), importedBy: info.importedBy, fileName: info.fileName,
    counts: { bank: input.bank.length, cash: input.cash.length, sales: input.sales.length },
  };
  docs.push({ id: 'settings', data: { settings: packSettings(input.settings) } });
  docs.push({ id: 'meta', data: { ...meta } });

  // Сначала записываем новое, потом удаляем лишние старые пачки (если строк стало меньше)
  // дебиторка и список «своих компаний» живут отдельно и при импорте таблицы не удаляются
  const keep = new Set([...docs.map(d => d.id), AR_DOC, RELATED_DOC, PROD_DOC]);
  const total = docs.length;
  let done = 0;
  onProgress?.(0, total);
  for (const part of chunks(docs, 3)) {
    const batch = writeBatch(db);
    part.forEach(d => batch.set(doc(db, COL, d.id), d.data));
    await withTimeout(batch.commit(), `запись ${part.map(d => d.id).join(', ')}`);
    done += part.length;
    onProgress?.(done, total);
  }
  const existing = await withTimeout(getDocs(collection(db, COL)), 'чтение списка документов');
  const stale = existing.docs.filter(d => !keep.has(d.id));
  for (const part of chunks(stale, 400)) {
    const batch = writeBatch(db);
    part.forEach(d => batch.delete(d.ref));
    await withTimeout(batch.commit(), 'удаление старых пачек');
  }
  return meta;
}

export async function loadReportData(): Promise<(ReportInput & { meta: ReportMeta | null }) | null> {
  const snap = await getDocs(collection(db, COL)); // весь набор
  if (snap.empty) return null;

  const bank: BankOp[] = [], cash: CashOp[] = [], sales: SaleRow[] = [];
  let settings: ReportSettings | null = null;
  let meta: ReportMeta | null = null;
  const sorted = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id));
  for (const d of sorted) {
    const data = d.data();
    if (d.id === 'settings') settings = unpackSettings(data.settings);
    else if (d.id === 'meta') meta = data as ReportMeta;
    else if (data.kind === 'bank') bank.push(...(data.rows as Packed[]).map(unpackBank));
    else if (data.kind === 'cash') cash.push(...(data.rows as Packed[]).map(unpackCash));
    else if (data.kind === 'sales') sales.push(...(data.rows as SaleRow[]));
  }
  if (!settings) return null;
  return { bank, cash, sales, settings, meta };
}

export interface StoredAr { report: ArReport; importedAt: number; importedBy: string; fileName: string }

export async function saveReceivables(report: ArReport, info: { importedBy: string; fileName: string }): Promise<void> {
  const data: StoredAr = { report, importedAt: Date.now(), importedBy: info.importedBy, fileName: info.fileName };
  const batch = writeBatch(db);
  batch.set(doc(db, COL, AR_DOC), data as unknown as Record<string, unknown>);
  await withTimeout(batch.commit(), 'запись дебиторки');
}

export async function loadReceivables(): Promise<{ ar: StoredAr | null; related: string[] }> {
  const snap = await getDocs(collection(db, COL));
  let ar: StoredAr | null = null;
  let related: string[] = DEFAULT_RELATED;
  snap.docs.forEach(d => {
    if (d.id === AR_DOC) ar = d.data() as StoredAr;
    if (d.id === RELATED_DOC && Array.isArray(d.data().names)) related = d.data().names as string[];
  });
  return { ar, related };
}

export async function saveRelated(names: string[]): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, COL, RELATED_DOC), { names });
  await withTimeout(batch.commit(), 'запись списка своих компаний');
}

export interface StoredProdPayroll { data: ProdPayroll; importedAt: number; importedBy: string; fileName: string }

export async function saveProdPayroll(data: ProdPayroll, info: { importedBy: string; fileName: string }): Promise<void> {
  const stored: StoredProdPayroll = { data, importedAt: Date.now(), importedBy: info.importedBy, fileName: info.fileName };
  const batch = writeBatch(db);
  batch.set(doc(db, COL, PROD_DOC), stored as unknown as Record<string, unknown>);
  await withTimeout(batch.commit(), 'запись табеля производства');
}

export async function loadProdPayroll(): Promise<StoredProdPayroll | null> {
  const snap = await getDoc(doc(db, COL, PROD_DOC));
  return snap.exists() ? (snap.data() as StoredProdPayroll) : null;
}
