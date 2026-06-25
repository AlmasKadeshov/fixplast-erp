import { BaseEntity } from './index';

// ============================================
// КАТЕГОРИИ (CATEGORIES) — Фаза 0, Задача 0.3
// Рефакторинг CostItems → Categories с иерархией
// ============================================

/** Тип категории для ДДС */
export type DdsCategoryType = 'operational' | 'investment' | 'financial' | 'ignore';

/** Тип категории для ОПиУ */
export type OpiuCategoryType = 'revenue' | 'cogs' | 'opex' | 'ignore';

/**
 * Категория расходов/доходов с иерархией
 * Заменяет плоский справочник CostItems
 */
export interface Category extends BaseEntity {
    /** Название категории */
    name: string;
    /** Тип: доход или расход */
    type: 'income' | 'expense';
    /** ID родительской категории (для иерархии групп) */
    parentId?: string;
    /** Системная категория — нельзя удалить/переименовать */
    isSystem: boolean;
    /** Классификация для ДДС */
    ddsCategory: DdsCategoryType;
    /** Классификация для ОПиУ */
    opiuCategory: OpiuCategoryType;
    /** Порядок сортировки */
    sortOrder: number;
    /** Иконка (опционально) */
    icon?: string;
    /** Старый itemId из costItems (для совместимости при миграции) */
    legacyItemId?: string;
}

/** Данные для создания/обновления категории */
export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Маппинг старых DDS категорий → новые
 */
export const DDS_CATEGORY_MAP: Record<string, DdsCategoryType> = {
    '1. Операционная': 'operational',
    '2. Инвестиционная': 'investment',
    '3. Финансовая': 'financial',
    'IGNORE': 'ignore',
};

/**
 * Маппинг старых OPIU категорий → новые
 */
export const OPIU_CATEGORY_MAP: Record<string, OpiuCategoryType> = {
    'Revenue': 'revenue',
    'COGS': 'cogs',
    'OPEX': 'opex',
    'IGNORE': 'ignore',
};

/**
 * Системные категории (isSystem = true) — нельзя удалить или переименовать
 * Правило: системные категории → в ДДС попадают, в ОПиУ НЕ попадают
 */
export const SYSTEM_CATEGORIES: CategoryInput[] = [
    {
        name: 'Инвестиции',
        type: 'expense',
        isSystem: true,
        ddsCategory: 'investment',
        opiuCategory: 'ignore',
        sortOrder: 900,
        legacyItemId: 'INVESTMENT',
    },
    {
        name: 'Выдача займа',
        type: 'expense',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 901,
        legacyItemId: 'LOAN_GRANTED',
    },
    {
        name: 'Получение кредита',
        type: 'income',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 902,
        legacyItemId: 'LOAN_RECEIVED',
    },
    {
        name: 'Погашение кредита',
        type: 'expense',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 903,
        legacyItemId: 'LOAN_REPAYMENT',
    },
    {
        name: 'Возврат займа',
        type: 'income',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 904,
        legacyItemId: 'LOAN_RETURN',
    },
    {
        name: 'Дивиденды',
        type: 'expense',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 905,
        legacyItemId: 'DIVIDEND',
    },
    {
        name: 'Взнос учредителя',
        type: 'income',
        isSystem: true,
        ddsCategory: 'financial',
        opiuCategory: 'ignore',
        sortOrder: 906,
        legacyItemId: 'FOUNDERS_IN',
    },
];

/**
 * Набор ID категорий доходов (для определения знака в отчётах)
 * Обновлённый аналог INCOME_CATEGORY_IDS из costItems
 */
export const INCOME_LEGACY_IDS = new Set([
    'CLIENT_PAYMENT',
    'TRANSIT_IN',
    'SUPPLIER_REFUND',
    'FOUNDERS_IN',
    'LOAN_RECEIVED',
    'LOAN_RETURN',
]);
