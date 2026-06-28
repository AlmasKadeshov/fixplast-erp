import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr } from './utils';
import { rowToObject } from '../xlsxParser';

export function mapOstatki(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);

    const bank = parseStr(obj['банк']);
    if (!bank) continue;

    const periodFrom = parseDate(obj['период с']);
    const periodTo = parseDate(obj['период по']);
    const openingBalance = parseNumber(obj['вх.остаток kzt']);
    const closingBalance = parseNumber(obj['исх.остаток kzt']);

    const firstHeader = sheet.headers[0] || '';
    const legalEntity = parseStr(obj[firstHeader] ?? obj['компания'] ?? '');

    docs.push({
      legalEntity,
      currency: parseStr(obj['валюта']) || 'KZT',
      bank,
      periodFrom,
      periodTo,
      openingBalance,
      closingBalance,
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'accountBalances', docs }];
}
