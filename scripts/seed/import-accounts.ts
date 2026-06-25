// @ts-nocheck
/**
 * import-accounts.ts — импорт банковских счетов из Счета.csv
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, log } from './firebase-admin.js';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Счета.csv');

const TYPE_MAP: Record<string, string> = {
  'bank': 'bank', 'банк': 'bank',
  'cash': 'cash', 'касса': 'cash', 'наличные': 'cash',
  'card': 'card', 'карта': 'card',
  'safe': 'safe', 'сейф': 'safe',
};

function parseAccountType(raw: string): string {
  return TYPE_MAP[raw?.toLowerCase()?.trim()] || 'bank';
}

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
    throw new Error('Файл Счета.csv не найден в seed-data/');
  }

  const db = getAdminDb();
  const content = readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCsv(content);

  if (rows.length === 0) {
    throw new Error('CSV пустой или неверный формат');
  }

  let saved = 0;
  const batch = db.batch();

  for (const row of rows) {
    const name = row['Название'] || row['name'];
    if (!name) continue;

    const ref = db.collection('accounts').doc();
    batch.set(ref, {
      name: name.trim(),
      type: parseAccountType(row['Тип'] || row['type'] || 'bank'),
      startingBalance: parseFloat((row['Начальный остаток'] || row['startingBalance'] || '0').replace(/\s/g, '').replace(',', '.')) || 0,
      bankName: (row['Банк'] || row['bankName'] || '').trim() || undefined,
      currency: 'KZT',
      isActive: (row['Активен'] || row['isActive'] || 'TRUE').toUpperCase() !== 'FALSE',
      sortOrder: saved,
      createdAt: new Date(),
    });
    saved++;
  }

  await batch.commit();
  log(`  → загружено счетов: ${saved}`);
}
