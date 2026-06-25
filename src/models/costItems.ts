import { BaseEntity } from './index';

/**
 * Статья расходов/доходов для ДДС и ОПиУ
 */
export interface CostItem extends BaseEntity {
    /** Уникальный код статьи */
    itemId: string;
    /** Название для отображения */
    itemName: string;
    /** Категория ДДС: 1. Операционная, 2. Инвестиционная, 3. Финансовая, IGNORE */
    ddsCategory: string;
    /** Категория ОПиУ: Revenue, COGS, OPEX, IGNORE */
    opiuCategory: string;
    /** Описание статьи */
    description?: string;
}

/**
 * Данные для создания статьи (без системных полей)
 */
export type CostItemInput = Omit<CostItem, 'id' | 'createdAt' | 'updatedAt'>;

/** Категории ДДС */
export type DdsCategory = '1. Операционная' | '2. Инвестиционная' | '3. Финансовая' | 'IGNORE';

/** Категории ОПиУ */
export type OpiuCategory = 'Revenue' | 'COGS' | 'OPEX' | 'IGNORE';

/**
 * Статьи, являющиеся ДОХОДАМИ (поступления на счёт) для ДДС
 * Используется для определения знака суммы в ДДС отчёте
 */
export const INCOME_CATEGORY_IDS = new Set([
    'CLIENT_PAYMENT',   // Поступление от Заказчика
    'TRANSIT_IN',       // Транзит (приход)
    'SUPPLIER_REFUND',  // Возврат от Поставщика
    'FOUNDERS_IN',      // Взнос Учредителя
]);

/**
 * Начальные данные справочника статей
 */
export const COST_ITEMS_SEED: CostItemInput[] = [
    {
        itemId: 'CLIENT_PAYMENT',
        itemName: 'Поступление от Заказчика (Выручка)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'IGNORE',
        description: 'Поступление денег на счет. В ОПиУ не входит — выручка считается по актам (CLIENT_REVENUE).',
    },
    {
        itemId: 'TRANSIT_IN',
        itemName: 'Транзит (приход под возврат)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'IGNORE',
        description: 'Временные деньги, не доход.',
    },
    {
        itemId: 'SUPPLIER_REFUND',
        itemName: 'Возврат от Поставщика',
        ddsCategory: '1. Операционная',
        opiuCategory: 'IGNORE',
        description: 'Возврат переплаты.',
    },
    {
        itemId: 'PAYMENT_FOR_TMC',
        itemName: 'Оплата Поставщику (ТМЦ)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'COGS',
        description: 'Закупка материалов.',
    },
    {
        itemId: 'SUBCONTRACT_SMR',
        itemName: 'СМР (Оплата Субподрядчикам)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'COGS',
        description: 'Прямые расходы на стройку.',
    },
    {
        itemId: 'SALARY_SMR',
        itemName: 'Зарплата (Прорабы, Рабочие)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'COGS',
        description: 'Прямой ФОТ.',
    },
    {
        itemId: 'SALARY_AUP',
        itemName: 'Зарплата (АУП: Офис, ПТО)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Банковские выплаты ЗП офису.',
    },
    {
        itemId: 'OFFICE_RENT',
        itemName: 'Аренда (Офис, Склад)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Постоянные расходы.',
    },
    {
        itemId: 'OFFICE_UTILS',
        itemName: 'Расходы на офис (Хоз. нужды)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Картридж, вода и т.д.',
    },
    {
        itemId: 'TAXES_AUP',
        itemName: 'Налоги (ФОТ, КПН, Соц. отчисл.)',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Налоги.',
    },
    {
        itemId: 'BANK_FEES',
        itemName: 'Банковские комиссии',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'РКО.',
    },
    {
        itemId: 'COST_OBJECT',
        itemName: 'Расходные материалы',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Мелкие расходы.',
    },
    {
        itemId: 'LOGISTICS_PROJECTS',
        itemName: 'Транспорт/Доставка',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Логистика.',
    },
    {
        itemId: 'ENTER_EXP',
        itemName: 'Представительские расходы',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Рестораны, встречи.',
    },
    {
        itemId: 'EDUCATION',
        itemName: 'Обучение сотрудников',
        ddsCategory: '1. Операционная',
        opiuCategory: 'OPEX',
        description: 'Тренинги.',
    },
    {
        itemId: 'ASSET_PURCHASE',
        itemName: 'Покупка ОС (Ноутбук, оборуд.)',
        ddsCategory: '2. Инвестиционная',
        opiuCategory: 'IGNORE',
        description: 'Покупка активов.',
    },
    {
        itemId: 'FOUNDERS_OUT',
        itemName: 'Вывод дивидендов Учредителю',
        ddsCategory: '3. Финансовая',
        opiuCategory: 'IGNORE',
        description: 'Распределение прибыли.',
    },
    {
        itemId: 'FOUNDERS_IN',
        itemName: 'Взнос Учредителя',
        ddsCategory: '3. Финансовая',
        opiuCategory: 'IGNORE',
        description: 'Финансирование.',
    },
    {
        itemId: 'CLIENT_REVENUE',
        itemName: 'Начисление клиенту (акт)',
        ddsCategory: 'IGNORE',
        opiuCategory: 'Revenue',
        description: 'Техническая статья для ОПиУ.',
    },
    {
        itemId: 'TMC_COGS',
        itemName: 'Списание ТМЦ в производство',
        ddsCategory: 'IGNORE',
        opiuCategory: 'COGS',
        description: 'Списание материалов.',
    },
    {
        itemId: 'INTERNAL_MOVE',
        itemName: 'Внутреннее перемещение',
        ddsCategory: 'IGNORE',
        opiuCategory: 'IGNORE',
        description: 'Перевод между своими счетами.',
    },
];
