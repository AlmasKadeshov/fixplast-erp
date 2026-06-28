import type { SheetConfig } from './types';

export const SHEET_CONFIGS: SheetConfig[] = [
  {
    type: 'journalBank',
    label: 'Журнал банка (транзакции)',
    collections: ['transactions'],
    nameMatches: ['журнал_банк', 'journal_bank', 'журнал банк'],
    headerSignature: ['дата', 'тип', 'сумма kzt'],
  },
  {
    type: 'sdelki',
    label: 'Сделки (операции по кошелькам)',
    collections: ['walletOperations'],
    nameMatches: ['сделки', 'sdelki'],
    headerSignature: ['дата', 'кошелёк от', 'раздел ддс'],
  },
  {
    type: 'spravochniki',
    label: 'Справочники (категории, кошельки)',
    collections: ['categories', 'wallets', 'operationTypes', 'cashflowSections'],
    nameMatches: ['справочники', 'spravochniki'],
    headerSignature: ['категории', 'кошельки'],
  },
  {
    type: 'sales',
    label: 'Продажи 1С (юрлица)',
    collections: ['sales'],
    nameMatches: ['продажи_1с', 'продажи_1с_юрлица', 'продажи 1с'],
    headerSignature: ['период', 'менеджер', 'номенклатура'],
  },
  {
    type: 'salesPhysical',
    label: 'Продажи 1С (физлица)',
    collections: ['sales'],
    nameMatches: ['продажи_1с_физлица', 'продажи 1с физлица'],
    headerSignature: ['период', 'контрагент', 'сумма с ндс'],
  },
  {
    type: 'ostatok',
    label: 'Остатки по счетам',
    collections: ['accountBalances'],
    nameMatches: ['остатки', 'ostatok'],
    headerSignature: ['банк', 'вх.остаток kzt', 'исх.остаток kzt'],
  },
  {
    type: 'loans',
    label: 'Займы',
    collections: ['loans'],
    nameMatches: ['займы', 'loans', 'zaymi'],
    headerSignature: ['контрагент', 'дата выдачи', 'выдано'],
  },
  {
    type: 'fixedAssets',
    label: 'Основные средства',
    collections: ['fixedAssets'],
    nameMatches: ['ос_справочник', 'ос справочник', 'основные средства'],
    headerSignature: ['наименование ос', 'дата ввода', 'первонач'],
  },
  {
    type: 'sebestoimost',
    label: 'Себестоимость (сырые данные)',
    collections: ['rawCostData'],
    nameMatches: ['себестоимость', 'sebestoimost'],
    headerSignature: ['цены на сырьё', 'сырьё', 'себестоимость'],
  },
];
