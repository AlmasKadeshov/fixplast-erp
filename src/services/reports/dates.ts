// Месяц операции считаем по времени Алматы (как GAS: timeZone Asia/Almaty).
// В xlsx даты лежат как «2026-01-05T18:59:12Z» = 6 января 00:00 по Алматы,
// поэтому брать UTC-месяц нельзя — операции 1-го числа уедут в прошлый месяц.

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function monthKey(d: Date): string {
  return fmt.format(d).slice(0, 7);
}

export function currentMonthKey(): string {
  return monthKey(new Date());
}

/** Excel-серийная дата (число) → момент полуночи по Алматы. Не зависит от часового пояса машины. */
const ALMATY_OFFSET_MS = 5 * 3600 * 1000;
export function excelSerialToDate(serial: number): Date {
  const wallMs = Math.round((serial - 25569) * 86400 * 1000); // «настенное» время как UTC
  return new Date(wallMs - ALMATY_OFFSET_MS);
}

/** 'yyyy-MM' из Date | 'yyyy-MM' | 'yyyy-MM-dd...' | 'yyyy.MM' ; иначе пусто */
export function normalizePeriod(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : monthKey(v);
  if (typeof v === 'number') return v > 20000 && v < 80000 ? monthKey(excelSerialToDate(v)) : '';
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  return s;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const names: Record<string, string> = {
    '01': 'янв.', '02': 'фев.', '03': 'мар.', '04': 'апр.', '05': 'май', '06': 'июнь',
    '07': 'июль', '08': 'авг.', '09': 'сен.', '10': 'окт.', '11': 'ноя.', '12': 'дек.',
  };
  return `${names[m] ?? m} ${y.slice(2)}`;
}
