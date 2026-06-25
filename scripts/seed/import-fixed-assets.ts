// @ts-nocheck
/**
 * import-fixed-assets.ts — импорт реестра ОС из ReEstr_OS_FixPlast_Group.xlsx
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { getAdminDb, log } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const XLSX_FILE = path.resolve(process.cwd(), 'seed-data', 'ReEstr_OS_FixPlast_Group.xlsx');
const BATCH_SIZE = 400;

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v || '0').replace(/\s/g, '').replace(',', '.')) || 0;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number') {
    // Excel serial date
    return XLSX.SSF.parse_date_code ? new Date((v - 25569) * 86400 * 1000) : null;
  }
  return null;
}

export async function run(): Promise<void> {
  if (!existsSync(XLSX_FILE)) throw new Error('Файл ReEstr_OS_FixPlast_Group.xlsx не найден в seed-data/');

  const db = getAdminDb();
  const buf = readFileSync(XLSX_FILE);
  const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

  if (rows.length === 0) throw new Error('Excel пустой или неверный формат');

  // Маппинг колонок — пробуем несколько возможных названий
  function getVal(row: Record<string, unknown>, ...keys: string[]): unknown {
    for (const k of keys) {
      if (k in row && row[k] !== null && row[k] !== '') return row[k];
    }
    return null;
  }

  let saved = 0;
  let skipped = 0;
  const batches = [];
  let batch = db.batch();
  let count = 0;

  for (const row of rows) {
    const name = String(getVal(row, 'Наименование', 'Название', 'Name', 'name') || '').trim();
    if (!name || name.toLowerCase().includes('итого') || name.toLowerCase().includes('всего')) {
      skipped++;
      continue;
    }

    const initialCost = toNum(getVal(row, 'Первоначальная стоимость', 'Первоначальная', 'initialCost'));
    const ref = db.collection('fixedAssets').doc();
    batch.set(ref, {
      name,
      inventoryNumber: String(getVal(row, 'Инвентарный номер', 'Инв. №', 'inventoryNumber') || '').trim() || null,
      commissionDate: toDate(getVal(row, 'Дата ввода в эксплуатацию', 'Дата ввода', 'commissionDate')),
      initialCost,
      residualCost: toNum(getVal(row, 'Остаточная стоимость', 'Остаточная', 'residualCost')) || initialCost,
      usefulLifeYears: toNum(getVal(row, 'Срок полезного использования', 'СПИ', 'usefulLifeYears')),
      depreciationRate: toNum(getVal(row, 'Норма амортизации', 'Норма', 'depreciationRate')),
      location: String(getVal(row, 'Местонахождение', 'Место', 'location') || '').trim() || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    saved++;
    count++;

    if (count >= BATCH_SIZE) { batches.push(batch); batch = db.batch(); count = 0; }
  }

  if (count > 0) batches.push(batch);
  for (const b of batches) await b.commit();

  log(`  → загружено ОС: ${saved} | пропущено: ${skipped}`);
}
