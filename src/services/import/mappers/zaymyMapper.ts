import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr } from './utils';
import { rowToObject } from '../xlsxParser';

export function mapZaymy(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);

    const counterparty = parseStr(obj['контрагент']);
    if (!counterparty) continue;

    const issuedAmount = parseNumber(obj['выдано (kzt)'] ?? obj['выдано']);
    const returnedAmount = parseNumber(obj['возвращено (kzt)'] ?? obj['возвращено']);
    const remainingDebt = parseNumber(obj['остаток долга (kzt)'] ?? obj['остаток долга']);

    docs.push({
      counterparty,
      issuedDate: parseDate(obj['дата выдачи']),
      issuedAmount,
      returnedAmount,
      remainingDebt,
      daysSinceIssue: parseNumber(obj['дней с выдачи']),
      lastReturnDate: parseDate(obj['последний возврат']),
      currency: 'KZT',
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'loans', docs }];
}
