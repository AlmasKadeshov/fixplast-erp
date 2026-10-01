// Типы данных отчётов ОПиУ / ДДС.
// Эти структуры 1-в-1 повторяют листы Google Sheets, которые читал GAS.

/** Лист «Журнал_Банк» */
export interface BankOp {
  date: Date;
  type: 'приход' | 'расход' | string;
  amount: number;       // «Сумма» в валюте операции
  category: string;     // «Статья»
  counterparty: string;
  purpose: string;
  company: string;      // Teplomax / Stonex
  currency: string;
  amountKzt: number;    // «Сумма KZT»
}

/** Лист «Сделки» (касса и кошельки) */
export interface CashOp {
  date: Date;
  type: 'приход' | 'расход' | 'перевод' | string;
  walletFrom: string;
  walletTo: string;
  amount: number;
  category: string;
  comment: string;
  section: string;
}

/** Листы «Продажи_1С» (юрлица) и «Продажи_1С_физлица» */
export interface SaleRow {
  period: string;       // yyyy-MM
  company: string;
  manager: string;
  client: string;
  clientType: string;
  product: string;
  qty: number;
  retQty: number;
  amountWithNds: number;
  nds: number;
  amountNet: number;
  source: 'юр.лица' | 'физ.лица';
}

export interface ProductWeights { metall: number; poliamid: number; pnd: number }
export interface MaterialPrices {
  pnd: number | null; metall: number | null; poliamid: number | null; pp: number | null; pvd: number | null;
}
export interface MaterialSplit { pnd: number; pp: number; pvd: number }

export interface ProductCostRow {
  name: string;
  metall: number; poliamid: number; pnd: number; // граммы
  cost: number;                                  // колонка «Себес» (₸), ручная
}

export interface FixedAssetAmort { amort: number; date: Date | null }

/** Всё, что кроме операций: справочники из листов Себестоимость, Цены_Сырья_История и т.д. */
export interface ReportSettings {
  staticPrices: { pnd: number; metall: number; poliamid: number }; // «Себестоимость» B2:B4, ₸/кг
  productCosts: ProductCostRow[];
  materialSplit: Record<string, MaterialSplit>;                    // «Дюбели», «Фиксаторы»
  priceHistory: Record<string, MaterialPrices>;                    // yyyy-MM
  zpProduction: Record<string, number>;
  zpOffice: Record<string, number>;
  managerBonuses: Record<string, number>;
  utilitiesPlant: Record<string, number>;
  assets: FixedAssetAmort[];
  /** Лист «Остатки»: исходящие остатки по банковским счетам (₸) */
  bankBalances: BankBalance[];
  /** Начальные остатки кошельков (лист «Кошельки» из отдельной таблицы кассы) */
  walletInitial: Record<string, number>;
}

export interface BankBalance { company: string; currency: string; bank: string; amount: number }

export interface ReportInput {
  bank: BankOp[];
  cash: CashOp[];
  sales: SaleRow[];
  settings: ReportSettings;
}

/** Строка отчёта: values — по месяцам в порядке months */
export interface ReportRow {
  key: string;
  label: string;
  values: number[];
  total: number;
  kind: 'line' | 'subtotal' | 'total' | 'percent' | 'header';
}
