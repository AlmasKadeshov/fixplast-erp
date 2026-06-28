import {
  collection,
  doc,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { MappedSheet, ImportResult } from './types';

const BATCH_SIZE = 499;

export interface WriteProgress {
  collection: string;
  processed: number;
  total: number;
}

export async function writeSheetToFirestore(
  mappedSheet: MappedSheet,
  onProgress: (p: WriteProgress) => void
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  for (const col of mappedSheet.collections) {
    const { name: colName, docs } = col;
    if (docs.length === 0) {
      results.push({ collection: colName, inserted: 0, skipped: 0, errors: 0 });
      continue;
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (let batchStart = 0; batchStart < docs.length; batchStart += BATCH_SIZE) {
      const batch = writeBatch(db);
      const slice = docs.slice(batchStart, batchStart + BATCH_SIZE);

      for (const docData of slice) {
        try {
          const data = docData as Record<string, unknown>;
          const colRef = collection(db, colName);

          if (data.id && typeof data.id === 'string') {
            const docRef = doc(colRef, data.id);
            const existing = await getDoc(docRef);
            if (existing.exists()) {
              skipped++;
              continue;
            }
            const { id: _id, ...rest } = data;
            batch.set(docRef, rest);
          } else {
            batch.set(doc(colRef), data);
          }
          inserted++;
        } catch {
          errors++;
        }
      }

      await batch.commit();

      onProgress({
        collection: colName,
        processed: Math.min(batchStart + BATCH_SIZE, docs.length),
        total: docs.length,
      });
    }

    results.push({ collection: colName, inserted, skipped, errors });
  }

  return results;
}

export async function writeAllSheets(
  sheets: MappedSheet[],
  onProgress: (overall: number, detail: WriteProgress) => void
): Promise<ImportResult[]> {
  const allResults: ImportResult[] = [];
  const totalCollections = sheets.reduce((s, sh) => s + sh.collections.length, 0);
  let doneCollections = 0;

  for (const sheet of sheets) {
    const results = await writeSheetToFirestore(sheet, (p) => {
      const overall = Math.round(
        ((doneCollections + p.processed / p.total) / totalCollections) * 100
      );
      onProgress(overall, p);
    });
    doneCollections += sheet.collections.length;
    allResults.push(...results);
  }

  return allResults;
}
