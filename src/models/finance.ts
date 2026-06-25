import { Timestamp } from 'firebase/firestore';
import { BaseEntity } from './index';
import { z } from 'zod';

// ============================================
// ФИНАНСЫ - ТРАНЗАКЦИИ
// ============================================

/**
 * Тип транзакции (v2: добавлен transfer)
 *
 * Правила для type=transfer:
 *   - Перевод НЕ попадает в ДДС (не является ни доходом ни расходом)
 *   - Перевод НЕ попадает в ОПиУ
 *   - Перевод изменяет остатки двух счетов: accountId ↓, accountToId ↑
 *   - Если есть transferCommission — она записывается как отдельная expense-транзакция
 */
export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * Статус транзакции
 */
export type TransactionStatus = 'plan' | 'fact';
export type TransactionRecurrenceRule = 'weekly' | 'monthly' | 'yearly';

/**
 * Transaction - Финансовая транзакция (v2.0)
 *
 * ОБРАТНАЯ СОВМЕСТИМОСТЬ:
 * Новые поля v2 помечены как optional (?) — они будут заполнены после миграции.
 * До миграции код продолжает использовать date/walletId.
 * После миграции: paymentDate = date, accountId = walletId mapping.
 *
 * Хелпер getPaymentDate(t) возвращает paymentDate || date
 */
export interface Transaction extends BaseEntity {
    // === ДАТЫ (legacy — используется до миграции) ===

    /** Дата операции (legacy, до миграции) */
    date: Timestamp;

    // === ДАТЫ (v2 — заполняются после миграции) ===

    /** Дата физического движения денег (для ДДС). После миграции = date */
    paymentDate?: Timestamp;

    /** Дата начала периода начисления (для ОПиУ). null = paymentDate как fallback */
    accrualDateFrom?: Timestamp | null;

    /** Дата конца периода начисления (для ОПиУ). null = accrualDateFrom */
    accrualDateTo?: Timestamp | null;

    // === ОСНОВНЫЕ ПОЛЯ ===

    /** Сумма (ВСЕГДА положительная, знак определяется через type) */
    amount: number;

    /** Тип операции (income / expense / transfer) */
    type: TransactionType;

    /** Статус: плановая или проведённая */
    status: TransactionStatus;

    /** ID кошелька (legacy, до миграции) */
    walletId: string;

    /** ID счёта (v2, заполняется после миграции) */
    accountId?: string;

    /** ID счёта зачисления (только для type=transfer) */
    accountToId?: string | null;

    // === КЛАССИФИКАЦИЯ ===

    /** ID контрагента */
    partnerId: string;

    /** БИН контрагента (для связки без lookup) */
    partnerBin?: string;

    /** ID категории (FK на costItems или categories) */
    categoryId: string;

    /** ID проекта */
    projectId: string;

    /** Массив ID тегов из коллекции tags (v2) */
    tagIds?: string[];

    // === ОПИСАНИЕ ===

    /** Описание / назначение платежа */
    description: string;

    /** Источник (номер документа) */
    sourceDoc: string;

    /** Тип источника */
    sourceType: 'bank' | '1c' | 'manual';

    // === ВАЛЮТА (v2) ===

    /** Валюта (ISO 4217, пока всегда KZT) */
    currency?: string;

    /** Курс к KZT (пока всегда 1) */
    exchangeRate?: number;

    // === TRANSFER (v2) ===

    /** Комиссия при переводе (идёт отдельно в расход) */
    transferCommission?: number | null;

    // === СИСТЕМНЫЕ ===

    /** Учетный период (для 1С, формат YYYY-MM) */
    accountingPeriod?: string;

    /** Сумма НДС */
    vatAmount?: number;

    /** Уникальный хеш для дедупликации (md5) */
    hash?: string;

    /** UID создателя (для проверки прав в Firestore) */
    createdBy?: string;

    /** Идентификатор серии повторяющихся платежей */
    recurrenceId?: string;

    /** Правило повторения платежа */
    recurrenceRule?: TransactionRecurrenceRule;
}

// === ХЕЛПЕРЫ для обратной совместимости ===

/** Получить дату платежа (v2 paymentDate или legacy date) */
export function getPaymentDate(t: Transaction): Timestamp {
    return t.paymentDate || t.date;
}

/** Получить ID счёта (v2 accountId или legacy walletId) */
export function getAccountId(t: Transaction): string {
    return t.accountId || t.walletId || '';
}

/** Получить теги (v2 tagIds или пустой массив) */
export function getTagIds(t: Transaction): string[] {
    return t.tagIds || [];
}

/**
 * Zod схема валидации транзакции (v2.0)
 */
export const TransactionSchema = z.object({
    date: z.instanceof(Timestamp),
    amount: z.number().positive('Сумма должна быть положительной'),
    type: z.enum(['income', 'expense', 'transfer']),
    status: z.enum(['plan', 'fact']),
    walletId: z.string().optional().default('Основной (KZT)'),
    partnerId: z.string().optional().default(''),
    partnerBin: z.string().optional().default(''),
    categoryId: z.string().optional().default(''),
    projectId: z.string().optional().default(''),
    description: z.string().optional().default(''),
    sourceDoc: z.string().optional().default(''),
    sourceType: z.enum(['bank', '1c', 'manual']).default('bank'),
    // v2 fields (optional until migration)
    paymentDate: z.instanceof(Timestamp).optional(),
    accrualDateFrom: z.instanceof(Timestamp).nullable().optional(),
    accrualDateTo: z.instanceof(Timestamp).nullable().optional(),
    accountId: z.string().optional(),
    accountToId: z.string().nullable().optional(),
    tagIds: z.array(z.string()).optional().default([]),
    currency: z.string().optional().default('KZT'),
    exchangeRate: z.number().optional().default(1),
    transferCommission: z.number().nullable().optional(),
    accountingPeriod: z.string().optional(),
    vatAmount: z.number().optional(),
    hash: z.string().optional(),
    createdBy: z.string().optional(),
    recurrenceId: z.string().optional(),
    recurrenceRule: z.enum(['weekly', 'monthly', 'yearly']).optional(),
});

/**
 * Фильтры для получения транзакций (v2.0)
 */
export interface TransactionFilters {
    startDate?: Date;
    endDate?: Date;
    status?: TransactionStatus;
    type?: TransactionType;
    walletId?: string;
    accountId?: string;
    projectId?: string;
    partnerId?: string;
    categoryId?: string;
    tagId?: string;
}

// ============================================
// КОНСТАНТЫ
// ============================================

/**
 * Названия типов транзакций на русском
 */
export const TRANSACTION_TYPE_NAMES: Record<TransactionType, string> = {
    income: 'Доход',
    expense: 'Расход',
    transfer: 'Перевод',
};

/**
 * Названия статусов транзакций на русском
 */
export const TRANSACTION_STATUS_NAMES: Record<TransactionStatus, string> = {
    plan: 'Плановая',
    fact: 'Проведённая',
};

/**
 * @deprecated Используйте коллекцию categories
 */
export const FINANCE_CATEGORIES = [
    'Поступление от заказчика',
    'Материалы',
    'Зарплата',
    'Офис',
    'Налоги',
    'Снятие',
    'Прочее',
];

/**
 * @deprecated Используйте коллекцию accounts
 * Оставлено для обратной совместимости при миграции
 */
export const WALLETS = [
    'Основной (KZT)',
    'Наличные',
    'Kaspi',
];
