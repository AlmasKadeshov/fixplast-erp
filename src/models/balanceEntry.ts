import { Timestamp } from 'firebase/firestore';
import { BaseEntity } from './index';

// ============================================
// РУЧНЫЕ СТАТЬИ БАЛАНСА (Balance Manual Entries)
// ============================================

export type BalanceSection =
    | 'fixed_assets'        // Внеоборотные активы
    | 'inventory'           // Запасы на складе
    | 'charter_capital'     // Уставной капитал
    | 'additional_capital'; // Добавочный капитал

export const BALANCE_SECTION_NAMES: Record<BalanceSection, string> = {
    fixed_assets: 'Внеоборотные активы',
    inventory: 'Запасы на складе',
    charter_capital: 'Уставной капитал',
    additional_capital: 'Добавочный капитал',
};

export interface BalanceManualEntry extends BaseEntity {
    section: BalanceSection;
    amount: number;
    description?: string;
    asOfDate: Timestamp;
}

export type BalanceManualEntryInput = Omit<BalanceManualEntry, 'id' | 'createdAt' | 'updatedAt'>;
