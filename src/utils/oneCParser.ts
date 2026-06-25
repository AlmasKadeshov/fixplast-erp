// Парсер выгрузок 1С (стандартный формат .txt / .csv)
export interface OneCRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  counterparty?: string;
  document?: string;
}

export async function parseOneCFile(file: File): Promise<OneCRow[]> {
  const text = await file.text();
  const lines = text.split('\n').filter(l => l.trim());
  const rows: OneCRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 4) continue;
    const date = parseDate1C(cols[0]);
    if (!date) continue;
    const debit = parseAmount(cols[3]);
    const credit = parseAmount(cols[4] || '0');
    if (debit > 0) rows.push({ date, description: cols[2] || '', amount: debit, type: 'expense', counterparty: cols[1] });
    if (credit > 0) rows.push({ date, description: cols[2] || '', amount: credit, type: 'income', counterparty: cols[1] });
  }
  return rows;
}

function parseDate1C(str: string): Date | null {
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return null;
}

function parseAmount(str: string): number {
  return parseFloat((str || '0').replace(/\s/g, '').replace(',', '.')) || 0;
}
