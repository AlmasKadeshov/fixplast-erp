// @ts-nocheck
/**
 * import-sales.ts — импорт продаж из Сделки.csv
 * Пишет в коллекцию sales + создаёт income-транзакции
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAdminDb, md5, log } from './firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const CSV_FILE = path.resolve(process.cwd(), 'seed-data', 'Сделки.csv');
const BATCH_SIZE = 400;

function parseDate(str: string): Date {
  // MM.YYYY → первый день месяца
  const m1 = str?.match(/^(\d{2})\.(\d{4})$/);
  if (m1) return new Date(+m1[2], +m1[1] - 1, 1);
  // DD.MM.YYYY
  const m2 = str?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
  return new Date();
}

function parseMoney(str: string): number {
  return parseFloat((str || '0').replace(/\s/g, '').replace(',', '.')) || 0;
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
  if (!existsSync(CSV_FILE)) {
    throw new Error('Файл Сделки.csv не найден в seed-data/');
  }

  const db = getAdminDb();
  const content = readFileSync(CSV_FILE, 'utf-8');
  const rows = parseCsv(content);
  if (rows.length === 0) throw new Error('CSV пустой или неверный формат');

  let savedSales = 0;
  let savedTx = 0;
  const salesBatches = [];
  const txBatches = [];
  let salesBatch = db.batch();
  let txBatch = db.batch();
  let sc = 0, tc = 0;

  for (const row of rows) {
    const dateStr = row['Период'] || row['date'] || '';
    const revenue = parseMoney(row['Выручка'] || row['revenue'] || '0');
    const profit = parseMoney(row['Прибыль'] || row['profit'] || '0');
    const counterparty = (row['Контрагент'] || row['counterparty'] || '').trim();
    const productName = (row['Номенклатура'] || row['productName'] || '').trim();
    const legalEntity = (row['Юр.лицо'] || row['legalEntity'] || '').trim();
    const managerName = (row['Менеджер'] || row['managerName'] || '').trim();

    if (!dateStr || revenue <= 0) continue;
    const date = parseDate(dateStr);

    // Сохраняем сырую сделку
    const saleRef = db.collection('sales').doc();
    salesBatch.set(saleRef, {
      date,
      legalEntity,
      managerName,
      counterparty,
      productName,
      quantity: parseMoney(row['Количество'] || row['quantity'] || '0'),
      revenue,
      vat: parseMoney(row['НДС'] || row['vat'] || '0'),
      profit,
      createdAt: FieldValue.serverTimestamp(),
    });
    savedSales++;
    sc++;

    // Создаём income-транзакцию
    const hash = md5(`sale|${dateStr}|${revenue}|${counterparty}|${productName}`);
    const txRef = db.collection('transactions').doc();
    txBatch.set(txRef, {
      date,
      description: `Выручка: ${productName || counterparty}`,
      amount: revenue,
      type: 'income',
      status: 'fact',
      accountId: null,
      accountName: null,
      categoryId: null,
      categoryName: 'Выручка',
      partnerId: null,
      partnerName: counterparty || null,
      projectId: null,
      tags: [],
      legalEntity: legalEntity || null,
      saleId: saleRef.id,
      hash,
      isRecurring: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    savedTx++;
    tc++;

    if (sc >= BATCH_SIZE) { salesBatches.push(salesBatch); salesBatch = db.batch(); sc = 0; }
    if (tc >= BATCH_SIZE) { txBatches.push(txBatch); txBatch = db.batch(); tc = 0; }
  }

  if (sc > 0) salesBatches.push(salesBatch);
  if (tc > 0) txBatches.push(txBatch);

  for (const b of salesBatches) await b.commit();
  for (const b of txBatches) await b.commit();

  log(`  → загружено сделок: ${savedSales} | income-транзакций: ${savedTx}`);
}
