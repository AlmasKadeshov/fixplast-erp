/**
 * Движок применения авто-правил для категоризации транзакций
 *
 * Порядок приоритетов:
 * 1. Пользовательские правила (из Firestore autoRules)
 * 2. Системные правила (hardcoded в costItemMatcher.ts)
 * 3. AI-категоризация (внешний вызов, не здесь)
 */

import { AutoRule } from '../models/autoRule';
import { autoMatchTransaction, AutoMatchResult } from './costItemMatcher';

export interface AutoRuleMatchResult {
    /** ID статьи расходов */
    categoryId: string | null;
    /** ID проекта */
    projectId: string | null;
    /** ID контрагента */
    partnerId: string | null;
    /** ID тега */
    tagId: string | null;
    /** Автоматически на АУП */
    autoAup: boolean;
    /** Источник совпадения */
    source: 'user-rule' | 'system-rule' | 'default';
    /** ID сработавшего правила (если user-rule) */
    matchedRuleId?: string;
    /** Название сработавшего правила */
    matchedRuleName?: string;
}

/**
 * Проверить, подходит ли транзакция под условия правила
 */
function matchesRule(
    rule: AutoRule,
    description: string,
    partnerName: string,
    type: 'income' | 'expense',
    amount: number
): boolean {
    const desc = (description || '').toLowerCase();
    const partner = (partnerName || '').toLowerCase();

    // Проверяем тип транзакции
    if (rule.transactionType && rule.transactionType !== type) {
        return false;
    }

    // Проверяем паттерн описания
    if (rule.descriptionPattern) {
        const pattern = rule.descriptionPattern.toLowerCase();
        if (!desc.includes(pattern)) {
            return false;
        }
    }

    // Проверяем паттерн контрагента
    if (rule.partnerPattern) {
        const pattern = rule.partnerPattern.toLowerCase();
        if (!partner.includes(pattern)) {
            return false;
        }
    }

    // Проверяем минимальную сумму
    if (rule.minAmount !== undefined && amount < rule.minAmount) {
        return false;
    }

    // Проверяем максимальную сумму
    if (rule.maxAmount !== undefined && amount > rule.maxAmount) {
        return false;
    }

    // Хотя бы одно условие должно быть задано
    if (!rule.descriptionPattern && !rule.partnerPattern && !rule.partnerId && !rule.transactionType) {
        return false;
    }

    return true;
}

/**
 * Применить каскад правил к транзакции:
 * 1. Пользовательские правила (переданный массив)
 * 2. Системные правила (costItemMatcher)
 *
 * @param userRules - массив активных пользовательских правил (уже отсортирован по priority)
 * @param description - назначение платежа
 * @param partnerName - имя контрагента
 * @param type - тип операции
 * @param amount - сумма
 */
export function applyAutoRules(
    userRules: AutoRule[],
    description: string,
    partnerName: string,
    type: 'income' | 'expense',
    amount: number,
    sourceType?: 'bank' | '1c' | 'manual'
): AutoRuleMatchResult {
    // 1. Проверяем пользовательские правила
    for (const rule of userRules) {
        if (matchesRule(rule, description, partnerName, type, amount)) {
            return {
                categoryId: rule.setCategoryId || null,
                projectId: rule.setProjectId || null,
                partnerId: rule.setPartnerId || null,
                tagId: rule.setTagId || null,
                autoAup: rule.setAutoAup || false,
                source: 'user-rule',
                matchedRuleId: rule.id,
                matchedRuleName: rule.name,
            };
        }
    }

    // 2. Системные правила (costItemMatcher.ts)
    const systemResult: AutoMatchResult = autoMatchTransaction(description, partnerName, type, sourceType);

    if (systemResult.itemId) {
        return {
            categoryId: systemResult.itemId,
            projectId: null,
            partnerId: null,
            tagId: null,
            autoAup: systemResult.autoAup,
            source: 'system-rule',
        };
    }

    // 3. Ничего не совпало
    return {
        categoryId: null,
        projectId: null,
        partnerId: null,
        tagId: null,
        autoAup: false,
        source: 'default',
    };
}

/**
 * Тестировать правило на примере текста
 * (для UI: пользователь вводит пример описания и видит результат)
 */
export function testRule(
    rule: AutoRule,
    description: string,
    partnerName: string,
    type: 'income' | 'expense',
    amount: number
): boolean {
    return matchesRule(rule, description, partnerName, type, amount);
}
