// @ts-nocheck
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, log } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Займы.csv');

function parseDate(str: string): Date | null {
  const m = str?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

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
  if (!existsSync(CSV_FILE)) throw new Error('Файл Займы.csv не найден в seed-data/');

  const db = getAdminDb();
  const rows = parseCsv(readFileSync(CSV_FILE, 'utf-8'));
  if (rows.length === 0) throw new Error('CSV пустой');

  const batch = db.batch();
  let saved = 0;

  for (const row of rows) {
    const borrowerName = (row['Заёмщик'] || row['borrowerName'] || '').trim();
    const amountStr = row['Сумма'] || row['amount'] || '0';
    if (!borrowerName) continue;
    const amount = parseFloat(amountStr.replace(/\s/g, '').replace(',', '.')) || 0;
    if (!amount) continue;

    const issueDate = parseDate(row['Дата выдачи'] || row['issueDate'] || '');
    const ref = db.collection('loans').doc();
    batch.set(ref, {
      borrowerName,
      amount,
      issueDate: issueDate || new Date(),
      rate: parseFloat((row['Ставка'] || row['rate'] || '0').replace(',', '.')) || 0,
      termMonths: parseInt(row['Срок (мес)'] || row['termMonths'] || '12') || 12,
      status: ((row['Статус'] || row['status'] || 'active').toLowerCase() === 'repaid') ? 'repaid' : 'active',
      createdAt: FieldValue.serverTimestamp(),
    });
    saved++;
  }

  await batch.commit();
  log(`  → загружено займов: ${saved}`);
}
