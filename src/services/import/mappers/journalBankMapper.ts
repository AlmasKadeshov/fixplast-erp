import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr, hashString } from './utils';
import { rowToObject } from '../xlsxParser';

const TYPE_MAP: Record<string, string> = {
  'приход': 'income',
  'расход': 'expense',
  'income': 'income',
  'expense': 'expense',
};

export function mapJournalBank(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];
  const seenHashes = new Set<string>();

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);

    const dateVal = obj['дата'];
    const typeRaw = parseStr(obj['тип']).toLowerCase();
    const amountKZT = parseNumber(obj['сумма kzt']);
    const amountOrig = parseNumber(obj['сумма']);
    const currency = parseStr(obj['валюта']) || 'KZT';
    const categoryName = parseStr(obj['статья']);
    const counterparty = parseStr(obj['контрагент']);
    const description = parseStr(obj['назначение']);
    const legalEntity = parseStr(obj['компания']);

    const dateTs = parseDate(dateVal);
    if (!dateTs) continue;
    if (amountKZT === 0 && amountOrig === 0) continue;

    const type = TYPE_MAP[typeRaw] || 'expense';
    const amount = amountKZT !== 0 ? amountKZT : amountOrig;

    const hashKey = `${parseStr(dateVal)}_${amount}_${counterparty}_${description}`;
    const hash = hashString(hashKey);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    docs.push({
      id: hash,
      date: dateTs,
      type,
      amount,
      amountOriginal: amountOrig,
      currency,
      categoryName,
      counterparty,
      description,
      legalEntity,
      status: 'fact',
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'transactions', docs }];
}
