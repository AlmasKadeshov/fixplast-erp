// @ts-nocheck
/**
 * import-categories.ts — импорт справочника статей из Категории.csv
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, log } from './firebase-admin.js';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Категории.csv');

const CASHFLOW_MAP: Record<string, string> = {
  'операционная': 'operational', 'operational': 'operational', 'оперативная': 'operational',
  'инвестиционная': 'investment', 'investment': 'investment',
  'финансовая': 'financial', 'financial': 'financial',
  'игнор': 'ignore', 'ignore': 'ignore', 'не учитывать': 'ignore',
};

const PNL_MAP: Record<string, string> = {
  'выручка': 'revenue', 'revenue': 'revenue', 'доход': 'revenue',
  'себестоимость': 'cogs', 'cogs': 'cogs',
  'opex': 'opex', 'операционные': 'opex', 'расходы': 'opex',
  'игнор': 'ignore', 'ignore': 'ignore',
};

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

export async function run(): Promise<void> {
  if (!existsSync(CSV_FILE)) {
    throw new Error('Файл Категории.csv не найден в seed-data/');
  }

  const db = getAdminDb();
  const content = readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCsv(content);

  if (rows.length === 0) throw new Error('CSV пустой или неверный формат');

  // Первый проход: создать родительские категории
  const parentMap: Record<string, string> = {};
  const batch = db.batch();
  let saved = 0;

  // Сначала создаём все без parentId
  const docIds: Record<string, string> = {};
  for (const row of rows) {
    const name = (row['Название'] || row['name'] || '').trim();
    if (!name) continue;
    const ref = db.collection('categories').doc();
    docIds[name] = ref.id;
    const cashflowRaw = (row['Тип ДДС'] || row['cashflowType'] || 'operational').toLowerCase().trim();
    const pnlRaw = (row['Тип ОПиУ'] || row['pnlType'] || 'opex').toLowerCase().trim();
    batch.set(ref, {
      name,
      cashflowType: CASHFLOW_MAP[cashflowRaw] || 'operational',
      pnlType: PNL_MAP[pnlRaw] || 'opex',
      parentId: null,
      isSystem: false,
      createdAt: new Date(),
    });
    saved++;
  }

  // Второй проход: обновляем parentId
  const batch2 = db.batch();
  for (const row of rows) {
    const name = (row['Название'] || row['name'] || '').trim();
    const parentName = (row['Родительская'] || row['parentName'] || '').trim();
    if (!name || !parentName || !docIds[parentName] || !docIds[name]) continue;
    batch2.update(db.collection('categories').doc(docIds[name]), {
      parentId: docIds[parentName],
    });
  }

  await batch.commit();
  await batch2.commit();
  log(`  → загружено категорий: ${saved}`);
}
