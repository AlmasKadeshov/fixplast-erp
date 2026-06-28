import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr } from './utils';
import { rowToObject } from '../xlsxParser';

const DDS_SECTION_MAP: Record<string, string> = {
  'операционная': 'operating',
  'инвестиционная': 'investing',
  'финансовая': 'financing',
};

export function mapSdelki(sheet: RecognizedSheet): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);
    const dateTs = parseDate(obj['дата']);
    if (!dateTs) continue;

    const amount = parseNumber(obj['сумма']);
    if (amount === 0) continue;

    const ddsSectionRaw = parseStr(obj['раздел ддс']).toLowerCase();
    const ddsSection = DDS_SECTION_MAP[ddsSectionRaw] || ddsSectionRaw;

    docs.push({
      date: dateTs,
      type: parseStr(obj['тип']),
      walletFrom: parseStr(obj['кошелёк от']),
      walletTo: parseStr(obj['кошелёк к']),
      amount,
      category: parseStr(obj['категория']),
      comment: parseStr(obj['комментарий']),
      cashflowSection: ddsSection,
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'walletOperations', docs }];
}
