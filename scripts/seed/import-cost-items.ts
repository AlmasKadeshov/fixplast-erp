// @ts-nocheck
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, log } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Себестоимость.csv');

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.replace(/"/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

export async function run(): Promise<void> {
  if (!existsSync(CSV_FILE)) throw new Error('Файл Себестоимость.csv не найден в seed-data/');

  const db = getAdminDb();
  const rows = parseCsv(readFileSync(CSV_FILE, 'utf-8'));
  if (rows.length === 0) throw new Error('CSV пустой');

  const batch = db.batch();
  let saved = 0;

  for (const row of rows) {
    const name = (row['Номенклатура'] || row['name'] || '').trim();
    if (!name) continue;
    const ref = db.collection('costItems').doc();
    batch.set(ref, {
      name,
      unit: (row['Единица'] || row['unit'] || 'шт').trim(),
      costPerUnit: parseFloat((row['Себестоимость'] || row['costPerUnit'] || '0').replace(',', '.')) || 0,
      rawMaterial: (row['Сырьё'] || row['rawMaterial'] || '').trim() || null,
      weightPerUnit: parseFloat((row['Вес на единицу'] || row['weightPerUnit'] || '0').replace(',', '.')) || 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    saved++;
  }

  await batch.commit();
  log(`  → загружено статей себестоимости: ${saved}`);
}
