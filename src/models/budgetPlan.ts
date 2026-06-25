import { BaseEntity } from './index';

// ============================================
// БЮДЖЕТНЫЙ ПЛАН (BUDGET PLAN) — Фаза 0, Задача 0.5
// ============================================

/**
 * BudgetPlan — плановый лимит по категории на месяц (бюджет)
 *
 * ВАЖНО: Разграничение двух разных понятий:
 * - Plan-транзакция (status="plan") = конкретный будущий платёж с датой и суммой
 *   → Используется в: прогнозе Календаря, дебиторке/кредиторке
 * - BudgetPlan = плановый лимит по категории на месяц
 *   → Используется в: отчёте План-Факт (сравнение план vs факт)
 *
 * Plan-транзакции НЕ влияют на бюджет.
 */
export interface BudgetPlan extends BaseEntity {
    /** Год */
    year: number;
    /** Месяц (1-12) */
    month: number;
    /** Тип: доход или расход */
    type: 'income' | 'expense';
    /** FK на коллекцию categories */
    categoryId: string;
    /** Опционально: разбивка по проекту */
    projectId?: string;
    /** Плановая сумма */
    plannedAmount: number;
}

/** Данные для создания/обновления бюджета */
export type BudgetPlanInput = Omit<BudgetPlan, 'id' | 'createdAt' | 'updatedAt'>;
