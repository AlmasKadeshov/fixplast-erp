import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr } from './utils';
import { rowToObject } from '../xlsxParser';

export function mapFixedAssets(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);

    const name = parseStr(obj['наименование ос']);
    if (!name || name.toLowerCase().includes('итого')) continue;

    const initialCost = parseNumber(obj['первонач. стоимость'] ?? obj['первонач']);
    const bookValue = parseNumber(obj['нетто (в баланс)'] ?? obj['нетто']);

    docs.push({
      number: parseStr(obj['№']),
      legalEntity: parseStr(obj['юрлицо']),
      category: parseStr(obj['категория']),
      name,
      commissioningDate: parseDate(obj['дата ввода']),
      lifetimeMonths: parseNumber(obj['срок (мес)']),
      initialCost,
      monthlyDepreciation: parseNumber(obj['мес. аморт.']),
      accumulatedDepreciation: parseNumber(obj['накопл. аморт.']),
      bookValue,
      wearPercent: parseNumber(obj['износ %']),
      remainingMonths: parseNumber(obj['ост. мес.']),
      writeOffDate: parseDate(obj['дата списания']),
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'fixedAssets', docs }];
}
