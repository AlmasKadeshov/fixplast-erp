// Разбор всей Google-таблицы (.xlsx) в ReportInput. Даты читаем как числа Excel (без cellDates),
// чтобы результат не зависел от часового пояса компьютера пользователя.
import * as XLSX from 'xlsx';
import type { ReportInput } from './types';
import { buildSettings, parseBank, parseCash, parseSalesLegal, parseSalesPhysical, toDate } from './sheetParsers';

export const REQUIRED_SHEETS = [
  'Журнал_Банк', 'Сделки', 'Продажи_1С', 'Продажи_1С_физлица', 'Себестоимость', 'Цены_Сырья_История',
  'ЗП_Производство', 'ЗП_Офис', 'Бонусы_Менеджеры', 'Коммунальные_Завод', 'ОС_справочник', 'Остатки',
] as const;
export const OPTIONAL_SHEETS = ['Кошельки'] as const;

/**
 * ВРЕМЕННО. Начальные остатки кошельков живут в отдельной таблице кассы (лист «Кошельки»),
 * которой нет в основном файле. Значения восстановлены по снимку остатков в листе ДДС (08.09.2026).
 * Как только в загружаемом файле появится лист «Кошельки» — он заменяет эти значения.
 */
export const WALLET_INITIAL_FALLBACK: Record<string, number> = {
  'Данияр': 2059930, 'Настя': 1128, 'касса_нал': 5000, 'Алмас Алматы': 82733, 'СЫРЫМ': 9345,
};

export interface ParsedWorkbook {
  input: ReportInput;
  found: string[];
  missing: string[];
  usedWalletFallback: boolean;
  /** Строки с нераспознанной датой — в отчёты не попали */
  dropped: { sheet: string; count: number; examples: string[] }[];
}

export function parseReportWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', sheets: [...REQUIRED_SHEETS, ...OPTIONAL_SHEETS] });
  const has = (n: string) => !!wb.Sheets[n];
  const sheet = (n: string): unknown[][] => {
    if (!has(n)) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true });
    while (rows.length && rows[rows.length - 1].every(c => c === '' || c == null)) rows.pop();
    return rows;
  };

  const found = [...REQUIRED_SHEETS, ...OPTIONAL_SHEETS].filter(has);
  const missing = REQUIRED_SHEETS.filter(n => !has(n));

  const settings = buildSettings({
    cost: sheet('Себестоимость'), prices: sheet('Цены_Сырья_История'), zpProd: sheet('ЗП_Производство'),
    zpOffice: sheet('ЗП_Офис'), bonuses: sheet('Бонусы_Менеджеры'), utilities: sheet('Коммунальные_Завод'),
    assets: sheet('ОС_справочник'), balances: sheet('Остатки'), wallets: has('Кошельки') ? sheet('Кошельки') : undefined,
  });
  const usedWalletFallback = !has('Кошельки');
  if (usedWalletFallback) settings.walletInitial = { ...WALLET_INITIAL_FALLBACK };

  const dropped: ParsedWorkbook['dropped'] = [];
  const bank = parseBank(sheet('Журнал_Банк'));
  const cash = parseCash(sheet('Сделки'));
  const countDropped = (name: string, parsedCount: number) => {
    const bad = sheet(name).slice(1).filter(r => r[0] !== '' && r[0] != null && !toDate(r[0]));
    if (bad.length) dropped.push({ sheet: name, count: bad.length, examples: bad.slice(0, 3).map(r => `«${String(r[0])}» ${String(r[2] ?? '')}`) });
    void parsedCount;
  };
  countDropped('Журнал_Банк', bank.length);
  countDropped('Сделки', cash.length);

  return {
    input: {
      bank,
      cash,
      sales: [...parseSalesLegal(sheet('Продажи_1С')), ...parseSalesPhysical(sheet('Продажи_1С_физлица'))],
      settings,
    },
    found, missing, usedWalletFallback, dropped,
  };
}
