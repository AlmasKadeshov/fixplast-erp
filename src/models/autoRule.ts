import { BaseEntity } from './index';
import { z } from 'zod';

// ============================================
// АВТО-ПРАВИЛА КАТЕГОРИЗАЦИИ
// ============================================

/**
 * AutoRule - Пользовательское правило авто-категоризации транзакций при импорте
 *
 * Приоритет применения:
 * 1. Пользовательские правила (эта коллекция)
 * 2. Системные правила (costItemMatcher.ts)
 * 3. AI-категоризация (aiService)
 */
export interface AutoRule extends BaseEntity {
    /** Название правила (для отображения) */
    name: string;

    /** Приоритет (чем меньше, тем раньше проверяется) */
    priority: number;

    /** Активно ли правило */
    enabled: boolean;

    // === УСЛОВИЯ СОВПАДЕНИЯ (все указанные должны совпасть) ===

    /** Паттерн по описанию/назначению платежа (подстрока, регистр-независимо) */
    descriptionPattern?: string;

    /** Паттерн по имени контрагента (подстрока, регистр-независимо) */
    partnerPattern?: string;

    /** Точный ID контрагента (альтернатива partnerPattern) */
    partnerId?: string;

    /** Только income или expense */
    transactionType?: 'income' | 'expense';

    /** Минимальная сумма */
    minAmount?: number;

    /** Максимальная сумма */
    maxAmount?: number;

    // === ДЕЙСТВИЯ (что присвоить при совпадении) ===

    /** Назначить статью расходов */
    setCategoryId?: string;

    /** Назначить проект */
    setProjectId?: string;

    /** Назначить контрагента */
    setPartnerId?: string;

    /** Автоматически привязать к АУП */
    setAutoAup?: boolean;

    /** Назначить тег */
    setTagId?: string;

    // === СТАТИСТИКА ===

    /** Сколько раз правило сработало */
    matchCount: number;

    /** Кто создал правило */
    createdBy: string;
}

/**
 * Zod схема для валидации авто-правила
 */
export const AutoRuleSchema = z.object({
    name: z.string().min(1, 'Название обязательно'),
    priority: z.number().int().min(0).default(100),
    enabled: z.boolean().default(true),
    descriptionPattern: z.string().optional(),
    partnerPattern: z.string().optional(),
    partnerId: z.string().optional(),
    transactionType: z.enum(['income', 'expense']).optional(),
    minAmount: z.number().positive().optional(),
    maxAmount: z.number().positive().optional(),
    setCategoryId: z.string().optional(),
    setProjectId: z.string().optional(),
    setPartnerId: z.string().optional(),
    setAutoAup: z.boolean().optional(),
    setTagId: z.string().optional(),
    matchCount: z.number().int().min(0).default(0),
    createdBy: z.string().optional().default(''),
});
