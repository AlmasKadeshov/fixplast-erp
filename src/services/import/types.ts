export type SheetType =
  | 'journalBank'
  | 'sdelki'
  | 'spravochniki'
  | 'sales'
  | 'salesPhysical'
  | 'ostatok'
  | 'loans'
  | 'fixedAssets'
  | 'sebestoimost';

export interface SheetConfig {
  type: SheetType;
  label: string;
  collections: string[];
  nameMatches: string[];
  headerSignature: string[];
}

export interface RecognizedSheet {
  sheetName: string;
  config: SheetConfig;
  rawRows: unknown[][];
  headerRowIndex: number;
  headers: string[];
  dataRowCount: number;
}

export interface MappedCollection {
  name: string;
  docs: Record<string, unknown>[];
}

export interface MappedSheet {
  sheetName: string;
  config: SheetConfig;
  collections: MappedCollection[];
  previewRows: Record<string, unknown>[];
  totalRowCount: number;
}

export interface ImportResult {
  collection: string;
  inserted: number;
  skipped: number;
  errors: number;
}

export type ImportStatus = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

export interface ImportState {
  status: ImportStatus;
  fileName: string;
  recognizedSheets: RecognizedSheet[];
  mappedSheets: MappedSheet[];
  selectedSheets: Set<string>;
  progress: number;
  currentOperation: string;
  results: ImportResult[];
  error?: string;
}
