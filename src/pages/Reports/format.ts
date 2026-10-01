// Форматирование чисел в стиле дизайна: «млн ₸» с запятой, минус «−».
export const MINUS = '−';

export const mln = (n: number, digits = 1): string => {
  if (n === 0) return '—';
  const abs = Math.abs(n / 1e6).toFixed(digits).replace('.', ',');
  return (n < 0 ? MINUS : '') + abs;
};

export const money = (n: number): string => {
  const s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (n < 0 ? MINUS : '') + s;
};

export const pct = (n: number, digits = 0): string => `${n < 0 ? MINUS : ''}${Math.abs(n).toFixed(digits).replace('.', ',')}%`;

export const delta = (cur: number, prev: number): { text: string; up: boolean } | null => {
  if (!prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return { text: `${d >= 0 ? '+' : MINUS}${Math.abs(d).toFixed(1).replace('.', ',')}%`, up: d >= 0 };
};

export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);

const MONTHS_FULL = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const monthFull = (key: string) => `${MONTHS_FULL[+key.slice(5) - 1]} ${key.slice(0, 4)}`;
export const monthGen = (key: string) => MONTHS_GEN[+key.slice(5) - 1];
export const monthShort = (key: string) => MONTHS_SHORT[+key.slice(5) - 1];
