import * as XLSX from 'xlsx';
import { SHEET_CONFIGS } from './sheetConfigs';
import type { RecognizedSheet, SheetConfig } from './types';

function normalizeStr(s: unknown): string {
  if (s == null) return '';
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function findHeaderRow(rows: unknown[][]): { index: number; headers: string[] } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] as unknown[];
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmpty.length >= 3) {
      return {
        index: i,
        headers: row.map(c => normalizeStr(c)),
      };
    }
  }
  return { index: 0, headers: (rows[0] || []).map(c => normalizeStr(c)) };
}

function matchConfig(sheetName: string, headers: string[]): SheetConfig | null {
  const normName = normalizeStr(sheetName);

  for (const cfg of SHEET_CONFIGS) {
    if (cfg.nameMatches.some(m => normName === m || normName.includes(m))) {
      return cfg;
    }
  }

  for (const cfg of SHEET_CONFIGS) {
    const matched = cfg.headerSignature.filter(sig =>
      headers.some(h => h.includes(sig))
    );
    if (matched.length >= Math.min(cfg.headerSignature.length, 2)) {
      return cfg;
    }
  }

  return null;
}

export function parseXlsxFile(arrayBuffer: ArrayBuffer): RecognizedSheet[] {
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: 'array',
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  });

  const recognized: RecognizedSheet[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd',
      defval: null,
    });

    if (rawRows.length < 2) continue;

    const { index: headerRowIndex, headers } = findHeaderRow(rawRows);
    const config = matchConfig(sheetName, headers);

    if (!config) continue;

    const dataRows = rawRows.slice(headerRowIndex + 1).filter(row =>
      (row as unknown[]).some(c => c != null && String(c).trim() !== '')
    );

    recognized.push({
      sheetName,
      config,
      rawRows: dataRows,
      headerRowIndex,
      headers,
      dataRowCount: dataRows.length,
    });
  }

  return recognized;
}

export function rowToObject(headers: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (h) obj[h] = row[i] ?? null;
  });
  return obj;
}
