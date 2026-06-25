// Парсер Excel-файлов для миграции данных из старых систем
import * as XLSX from 'xlsx';

// Типы для совместимости с RdoMigrationModal
export interface RdoRow {
  date: Date | string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryName?: string;
  projectName?: string;
  counterparty?: string;
  [key: string]: unknown;
}

export interface MigrationPreview {
  rows: RdoRow[];
  total: number;
  errors: string[];
}

export async function parseUchetAmre(file: File): Promise<MigrationPreview> {
  const buffer = await file.arrayBuffer();
  const rows = parseExcelFile(buffer) as RdoRow[];
  return { rows, total: rows.length, errors: [] };
}

export interface MigrationRow {
  [key: string]: string | number | Date | null;
}

export function parseExcelFile(buffer: ArrayBuffer): MigrationRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<MigrationRow>(sheet, { defval: null });
}

export function parseExcelFileAllSheets(buffer: ArrayBuffer): Record<string, MigrationRow[]> {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const result: Record<string, MigrationRow[]> = {};
  for (const name of workbook.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json<MigrationRow>(workbook.Sheets[name], { defval: null });
  }
  return result;
}
