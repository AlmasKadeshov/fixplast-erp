import { BaseEntity } from './index';

// ============================================
// СЧЕТА (ACCOUNTS) — Фаза 0, Задача 0.1
// ============================================

/** Тип счёта */
export type AccountType = 'bank' | 'cash' | 'card' | 'safe' | 'crypto';

/**
 * Счёт компании (банковский, касса, карта и т.д.)
 * Заменяет жёсткий массив WALLETS
 *
 * Формула баланса (ТОЛЬКО фактические операции):
 * balance = startingBalance
 *   + Σ amount WHERE type="income" AND status="fact" AND accountId=X
 *   − Σ amount WHERE type="expense" AND status="fact" AND accountId=X
 *   + Σ amount WHERE type="transfer" AND status="fact" AND accountToId=X
 *   − Σ amount WHERE type="transfer" AND status="fact" AND accountId=X
 */
export interface Account extends BaseEntity {
    /** Название счёта (напр. "Банковский счет Halyk") */
    name: string;
    /** Тип счёта */
    type: AccountType;
    /** Валюта (ISO 4217) */
    currency: string;
    /** Начальный остаток (может быть отрицательным) */
    startingBalance: number;
    /** Активен ли счёт */
    isActive: boolean;
    /** Название банка (опционально) */
    bankName?: string;
    /** Порядок сортировки */
    sortOrder: number;
}

/** Данные для создания/обновления счёта */
export type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

/** Маппинг старых walletId на новые accounts */
export const WALLET_TO_ACCOUNT_MAP: Record<string, { name: string; type: AccountType; bankName?: string }> = {
    'Основной (KZT)': { name: 'Основной (KZT)', type: 'bank', bankName: 'Halyk' },
    'Наличные': { name: 'Наличные', type: 'cash' },
    'Kaspi': { name: 'Kaspi', type: 'card', bankName: 'Kaspi' },
};

/** Дефолтные счета для миграции */
export const DEFAULT_ACCOUNTS: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>[] = [
    { name: 'Основной (KZT)', type: 'bank', currency: 'KZT', startingBalance: 0, isActive: true, bankName: 'Halyk', sortOrder: 1 },
    { name: 'Наличные', type: 'cash', currency: 'KZT', startingBalance: 0, isActive: true, sortOrder: 2 },
    { name: 'Kaspi', type: 'card', currency: 'KZT', startingBalance: 0, isActive: true, bankName: 'Kaspi', sortOrder: 3 },
];
