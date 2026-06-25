import { Timestamp } from 'firebase/firestore';

export function startOfDay(date: Date): Timestamp {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

export function endOfDay(date: Date): Timestamp {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(d);
}

export function toDate(value: Timestamp | Date | string | null | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}
