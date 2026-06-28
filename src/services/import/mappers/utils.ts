import { Timestamp } from 'firebase/firestore';

export function parseDate(val: unknown): Timestamp | null {
  if (!val) return null;
  if (val instanceof Date) return Timestamp.fromDate(val);
  const str = String(val).trim();
  if (!str) return null;
  let d: Date;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
    const [day, month, year] = str.split('.');
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    d = new Date(str + 'T00:00:00');
  } else {
    d = new Date(str);
  }
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

export function parseNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

export function parseStr(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
