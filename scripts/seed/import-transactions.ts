// @ts-nocheck
/**
 * import-transactions.ts — импорт транзакций из Журнал_Банк.csv
 * Считает MD5-хеш для дедупликации
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, md5, log } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Журнал_Банк.csv');
const BATCH_SIZE = 400;

function parseDate(str: string): Date | null {
  const m1 = str?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
  const m2 = str?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  return null;
}

function parseMoney(str: string): number {
  return parseFloat((str || '0').replace(/\s/g, '').replace(',', '.')) || 0;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  // Пробуем определить разделитель
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
  if (!existsSync(CSV_FILE)) {
    throw new Error('Файл Журнал_Банк.csv не найден в seed-data/');
  }

  const db = getAdminDb();
  const content = readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCsv(content);

  if (rows.length === 0) throw new Error('CSV пустой или неверный формат');

  // Загружаем существующие хеши для дедупликации
  const existingHashes = new Set<string>();
  const existingSnap = await db.collection('transactions').select('hash').get();
  existingSnap.forEach(d => {
    const h = d.data().hash;
    if (h) existingHashes.add(h);
  });

  let saved = 0;
  let skipped = 0;
  let batches: ReturnType<typeof db.batch>[] = [];
  let current = db.batch();
  let count = 0;

  for (const row of rows) {
    const dateStr = row['Дата'] || row['date'] || '';
    const description = (row['Описание'] || row['description'] || '').trim();
    const amountStr = row['Сумма'] || row['amount'] || '0';
    const type = ((row['Тип'] || row['type']) === 'income' || (row['Тип'] || '').toLowerCase().includes('приход')) ? 'income' : 'expense';
    const accountName = (row['Счёт'] || row['accountName'] || '').trim();

    const date = parseDate(dateStr);
    if (!date) { skipped++; continue; }
    const amount = parseMoney(amountStr);
    if (amount <= 0) { skipped++; continue; }

    // MD5 хеш для дедупликации
    const hash = md5(`${dateStr}|${amount}|${description}|${accountName}|${type}`);
    if (existingHashes.has(hash)) { skipped++; continue; }
    existingHashes.add(hash);

    const ref = db.collection('transactions').doc();
    current.set(ref, {
      date,
      description,
      amount,
      type,
      status: 'fact',
      accountId: null, // будет связано по accountName после загрузки счетов
      accountName,
      categoryId: null,
      categoryName: (row['Статья'] || row['categoryName'] || '').trim() || null,
      partnerId: null,
      partnerName: (row['Контрагент'] || row['counterparty'] || '').trim() || null,
      partnerBin: (row['БИН'] || row['partnerBin'] || '').trim() || null,
      projectId: null,
      tags: [],
      legalEntity: (row['Юр.лицо'] || row['legalEntity'] || '').trim() || null,
      hash,
      isRecurring: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    count++;
    saved++;

    if (count >= BATCH_SIZE) {
      batches.push(current);
      current = db.batch();
      count = 0;
    }
  }

  if (count > 0) batches.push(current);

  for (const b of batches) await b.commit();

  log(`  → загружено транзакций: ${saved} | пропущено (дубли/ошибки): ${skipped}`);
}
