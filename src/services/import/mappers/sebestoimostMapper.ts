import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { rowToObject } from '../xlsxParser';

export function mapSebestoimost(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = sheet.rawRows.map(row => {
    const obj = rowToObject(sheet.headers, row as unknown[]);
    return { ...obj, source: 'import', createdAt: Timestamp.now() };
  });

  return [{ name: 'rawCostData', docs }];
}
