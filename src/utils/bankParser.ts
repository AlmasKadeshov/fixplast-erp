// Парсер банковских выписок (Halyk, Kaspi)
// Реализация будет расширена при получении реальных файлов

// Алиас для совместимости с компонентами
export type TransactionDTO = ParsedBankRow;

export interface ParsedBankRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  counterparty?: string;
  reference?: string;
  hash?: string;
}

export type BankFormat = 'halyk' | 'kaspi' | 'unknown';

export function detectFormat(content: string): BankFormat {
  if (content.includes('Народный Банк') || content.includes('Halyk')) return 'halyk';
  if (content.includes('Kaspi') || content.includes('Каспи')) return 'kaspi';
  return 'unknown';
}

export async function parseBankStatement(file: File): Promise<ParsedBankRow[]> {
  const text = await file.text();
  const format = detectFormat(text);

  switch (format) {
    case 'halyk': return parseHalyk(text);
    case 'kaspi': return parseKaspi(text);
    default: return parseGenericCsv(text);
  }
}

function parseHalyk(content: string): ParsedBankRow[] {
  const lines = content.split('\n').filter(l => l.trim());
  const rows: ParsedBankRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
    if (cols.length < 5) continue;
    const [dateStr, desc, , debit, credit] = cols;
    const date = parseDate(dateStr);
    if (!date) continue;
    const debitAmt = parseFloat((debit || '0').replace(/\s/g, '').replace(',', '.')) || 0;
    const creditAmt = parseFloat((credit || '0').replace(/\s/g, '').replace(',', '.')) || 0;
    if (debitAmt > 0) {
      rows.push({ date, description: desc, amount: debitAmt, type: 'expense', counterparty: cols[2] });
    }
    if (creditAmt > 0) {
      rows.push({ date, description: desc, amount: creditAmt, type: 'income', counterparty: cols[2] });
    }
  }
  return rows;
}

function parseKaspi(content: string): ParsedBankRow[] {
  return parseGenericCsv(content);
}

function parseGenericCsv(content: string): ParsedBankRow[] {
  const lines = content.split('\n').filter(l => l.trim());
  const rows: ParsedBankRow[] = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(/[;,]/).map(c => c.replace(/"/g, '').trim());
    if (cols.length < 3) continue;
    const date = parseDate(cols[0]);
    if (!date) continue;
    const amount = Math.abs(parseFloat((cols[2] || '0').replace(/\s/g, '').replace(',', '.')) || 0);
    if (!amount) continue;
    rows.push({
      date,
      description: cols[1] || '',
      amount,
      type: amount < 0 ? 'expense' : 'income',
    });
  }
  return rows;
}

function parseDate(str: string): Date | null {
  if (!str) return null;
  // DD.MM.YYYY или YYYY-MM-DD
  const m1 = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);
  const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  return null;
}
