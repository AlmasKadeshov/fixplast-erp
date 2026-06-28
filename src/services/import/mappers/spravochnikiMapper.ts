import { Timestamp } from 'firebase/firestore';
import type { RecognizedSheet, MappedCollection } from '../types';
import { parseStr } from './utils';

export function mapSpravochniki(sheet: RecognizedSheet): MappedCollection[] {
  const categories: Record<string, unknown>[] = [];
  const wallets: Record<string, unknown>[] = [];
  const operationTypes: Record<string, unknown>[] = [];
  const cashflowSections: Record<string, unknown>[] = [];

  const headers = sheet.headers;

  function colIndex(keyword: string): number {
    return headers.findIndex(h => h.includes(keyword));
  }

  const catIdx = colIndex('категори');
  const walletIdx = colIndex('кошелёк');
  const opTypeIdx = colIndex('тип операци');
  const ddsIdx = colIndex('раздел ддс');

  const now = Timestamp.now();

  for (const row of sheet.rawRows) {
    const cells = row as unknown[];

    if (catIdx >= 0) {
      const v = parseStr(cells[catIdx]);
      if (v) categories.push({ name: v, source: 'import', createdAt: now });
    }
    if (walletIdx >= 0) {
      const v = parseStr(cells[walletIdx]);
      if (v) wallets.push({ name: v, source: 'import', createdAt: now });
    }
    if (opTypeIdx >= 0) {
      const v = parseStr(cells[opTypeIdx]);
      if (v) operationTypes.push({ name: v, source: 'import', createdAt: now });
    }
    if (ddsIdx >= 0) {
      const v = parseStr(cells[ddsIdx]);
      if (v) cashflowSections.push({ name: v, source: 'import', createdAt: now });
    }
  }

  function dedup(arr: Record<string, unknown>[]): Record<string, unknown>[] {
    const seen = new Set<string>();
    return arr.filter(d => {
      const key = String(d.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return [
    { name: 'categories', docs: dedup(categories) },
    { name: 'wallets', docs: dedup(wallets) },
    { name: 'operationTypes', docs: dedup(operationTypes) },
    { name: 'cashflowSections', docs: dedup(cashflowSections) },
  ].filter(c => c.docs.length > 0);
}
