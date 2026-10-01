// Чистый движок отчётов — без Firebase и React (запускается и в Node для сверки).
export * from './types';
export * from './config';
export * from './dates';
export * from './products';
export * from './cost';
export * from './sheetParsers';
export { buildOpiu, type OpiuResult, type OpiuOptions } from './opiu';
export { buildDds, type DdsResult, type DdsSection } from './dds';
export { buildBalances, type BalancesResult, type BalanceItem } from './balances';
export * from './workbook';
export * from './validate';
export * from './insights';
export * from './flows';
