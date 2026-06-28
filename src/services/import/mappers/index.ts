import type { RecognizedSheet, MappedSheet, MappedCollection } from '../types';
import { mapJournalBank } from './journalBankMapper';
import { mapSdelki } from './sdelkiMapper';
import { mapSpravochniki } from './spravochnikiMapper';
import { mapSales } from './salesMapper';
import { mapOstatki } from './ostatkiMapper';
import { mapZaymy } from './zaymyMapper';
import { mapFixedAssets } from './fixedAssetsMapper';
import { mapSebestoimost } from './sebestoimostMapper';

export function mapSheet(sheet: RecognizedSheet): MappedSheet {
  let collections: MappedCollection[];

  switch (sheet.config.type) {
    case 'journalBank':
      collections = mapJournalBank(sheet);
      break;
    case 'sdelki':
      collections = mapSdelki(sheet);
      break;
    case 'spravochniki':
      collections = mapSpravochniki(sheet);
      break;
    case 'sales':
      collections = mapSales(sheet, 'legal');
      break;
    case 'salesPhysical':
      collections = mapSales(sheet, 'physical');
      break;
    case 'ostatok':
      collections = mapOstatki(sheet);
      break;
    case 'loans':
      collections = mapZaymy(sheet);
      break;
    case 'fixedAssets':
      collections = mapFixedAssets(sheet);
      break;
    case 'sebestoimost':
      collections = mapSebestoimost(sheet);
      break;
    default:
      collections = [];
  }

  const firstCollDocs = collections[0]?.docs ?? [];

  return {
    sheetName: sheet.sheetName,
    config: sheet.config,
    collections,
    previewRows: firstCollDocs.slice(0, 10) as Record<string, unknown>[],
    totalRowCount: firstCollDocs.length,
  };
}
