import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseDate, parseNumber, parseStr } from './utils';
import { rowToObject } from '../xlsxParser';

export function mapSales(sheet: RecognizedSheet, clientType: 'legal' | 'physical' = 'legal'): MappedCollection[] {
  const docs: Record<string, unknown>[] = [];

  for (const row of sheet.rawRows) {
    const obj = rowToObject(sheet.headers, row as unknown[]);

    const periodRaw = parseStr(obj['период']);
    if (!periodRaw || periodRaw.toLowerCase().includes('итого')) continue;

    const dateTs = parseDate(obj['период']);
    const sumWithVat = parseNumber(obj['сумма с ндс']);
    const sumWithoutVat = parseNumber(obj['сумма без ндс']);
    const vat = parseNumber(obj['ндс']);
    const qty = parseNumber(obj['кол-во']);

    if (sumWithVat === 0 && sumWithoutVat === 0) continue;

    docs.push({
      date: dateTs,
      period: periodRaw,
      company: parseStr(obj['компания']),
      manager: parseStr(obj['менеджер']),
      counterparty: parseStr(obj['контрагент']),
      clientType: parseStr(obj['тип клиента']) || clientType,
      nomenclature: parseStr(obj['номенклатура']),
      quantity: qty,
      isReturn: parseNumber(obj['возврат']) !== 0,
      amountWithVat: sumWithVat,
      vat,
      amount: sumWithoutVat,
      pricePerUnit: parseNumber(obj['цена за ед.']),
      source: 'import',
      createdAt: Timestamp.now(),
    });
  }

  return [{ name: 'sales', docs }];
}
