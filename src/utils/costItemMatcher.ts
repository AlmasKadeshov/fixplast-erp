/**
 * Автоматическое определение статьи и проекта по назначению платежа
 */

interface MatchRule {
    keywords: string[];
    itemId: string;
    /** Если true, автоматически привязывать к проекту АУП */
    autoAup?: boolean;
}

/**
 * Результат автоматического определения
 */
export interface AutoMatchResult {
    itemId: string | null;
    /** Автоматически назначить на проект АУП */
    autoAup: boolean;
}

/**
 * Ключевое слово для поиска проекта "Общие расходы компании (АУП)"
 */
export const AUP_PROJECT_KEYWORD = 'общие расходы';

/**
 * Правила маппинга ключевых слов -> статья + проект
 *
 * ВАЖНО: Правила проверяются по порядку, более специфичные должны быть выше!
 */
const MATCH_RULES: MatchRule[] = [
    // === АВТОМАТИЧЕСКИ НА АУП ===

    // Снятие наличных -> Вывод дивидендов + АУП
    { keywords: ['снятие наличных', 'снятие налич', 'выдача наличных'], itemId: 'FOUNDERS_OUT', autoAup: true },

    // Банковские комиссии -> Комиссия банка + АУП
    { keywords: ['комиссия', 'ркс', 'обслуживание счета', 'commission', 'комиссия банка'], itemId: 'BANK_FEES', autoAup: true },

    // Налоги и отчисления -> АУП
    { keywords: ['опв', 'осмс', 'со ', 'соц. отчисл', 'кпн', 'ипн', 'налог'], itemId: 'TAXES_AUP', autoAup: true },

    // Зарплата -> АУП
    { keywords: ['зарплата', 'зп ', 'заработн', 'перечисление зп'], itemId: 'SALARY_AUP', autoAup: true },

    // Дивиденды -> АУП
    { keywords: ['дивиденд', 'распределение прибыли', 'выплата учредител'], itemId: 'FOUNDERS_OUT', autoAup: true },

    // === БЕЗ АВТОМАТИЧЕСКОГО ПРОЕКТА (требуют ручного выбора) ===

    // Аренда офиса -> АУП
    { keywords: ['аренда офис', 'арендная плата офис'], itemId: 'OFFICE_RENT', autoAup: true },

    // Аренда (общая, может быть на проект)
    { keywords: ['аренда', 'арендная плата', 'арен.'], itemId: 'OFFICE_RENT' },

    // Материалы / ТМЦ
    { keywords: ['материал', 'тмц', 'товар', 'закуп', 'комплектующ'], itemId: 'PAYMENT_FOR_TMC' },

    // СМР Субподряд
    { keywords: ['смр', 'субподряд', 'монтаж', 'демонтаж', 'работы по договору'], itemId: 'SUBCONTRACT_SMR' },

    // Логистика
    { keywords: ['доставка', 'транспорт', 'перевозка', 'логистик'], itemId: 'LOGISTICS_PROJECTS' },

    // Представительские
    { keywords: ['ресторан', 'кафе', 'представит'], itemId: 'ENTER_EXP' },

    // Аванс (может быть зарплата или предоплата поставщику)
    { keywords: ['аванс'], itemId: 'SALARY_AUP' },

    // Взнос учредителя
    { keywords: ['взнос учредител', 'пополнение уставн'], itemId: 'FOUNDERS_IN' },

    // Внутреннее перемещение
    { keywords: ['перевод между счетами', 'внутренн', 'собственный счет'], itemId: 'INTERNAL_MOVE' },
];

/**
 * Проверка, является ли имя контрагента ФИО физического лица
 * Признаки ФИО:
 * - Начинается с заглавной буквы
 * - Содержит 2-3 слова
 * - Не содержит "ТОО", "АО", "ИП" (кроме "ИП Фамилия")
 * - Слова похожи на имена (начинаются с заглавной, не содержат цифр)
 */
export function isPersonName(partnerName: string): boolean {
    if (!partnerName) return false;

    const trimmed = partnerName.trim();

    // Если содержит юр. лицо маркеры — не ФИО
    const legalMarkers = ['тоо', 'ао ', 'оао', 'зао', 'пао', 'ооо', 'филиал', 'отделение', 'банк', 'акционер'];
    const lowerName = trimmed.toLowerCase();
    if (legalMarkers.some(marker => lowerName.includes(marker))) {
        return false;
    }

    // Разбиваем на слова
    const words = trimmed.split(/\s+/).filter(w => w.length > 1);

    // ФИО обычно 2-4 слова (Фамилия Имя или Фамилия Имя Отчество)
    if (words.length < 2 || words.length > 4) {
        return false;
    }

    // Проверяем, что все слова начинаются с заглавной и не содержат цифр
    const namePattern = /^[А-ЯЁA-Z][а-яёa-z]+$/;

    // Для "ИП Фамилия Имя" — пропускаем "ИП"
    const wordsToCheck = words[0].toUpperCase() === 'ИП' ? words.slice(1) : words;

    if (wordsToCheck.length < 2) return false;

    // Все слова должны выглядеть как имена
    const allWordsAreName = wordsToCheck.every(word => namePattern.test(word));

    return allWordsAreName;
}

/**
 * Определить статью по тексту назначения платежа
 * @param purpose - назначение платежа из выписки
 * @returns itemId статьи или null если не найдено
 */
export function matchCostItem(purpose: string): string | null {
    if (!purpose) return null;

    const normalized = purpose.toLowerCase();

    for (const rule of MATCH_RULES) {
        for (const keyword of rule.keywords) {
            if (normalized.includes(keyword.toLowerCase())) {
                return rule.itemId;
            }
        }
    }

    return null;
}

/**
 * Полное автоматическое определение статьи и проекта
 * @param purpose - назначение платежа
 * @param partnerName - имя контрагента
 * @param type - тип операции (income/expense)
 */
export function autoMatchTransaction(
    purpose: string,
    partnerName: string,
    type: 'income' | 'expense',
    sourceType?: 'bank' | '1c' | 'manual'
): AutoMatchResult {
    const normalized = (purpose || '').toLowerCase();

    // 1. Проверяем правила по ключевым словам
    for (const rule of MATCH_RULES) {
        for (const keyword of rule.keywords) {
            if (normalized.includes(keyword.toLowerCase())) {
                return {
                    itemId: rule.itemId,
                    autoAup: rule.autoAup || false
                };
            }
        }
    }

    // 2. Проверяем, является ли контрагент физ. лицом (ФИО) -> Зарплата + АУП
    if (type === 'expense' && isPersonName(partnerName)) {
        return {
            itemId: 'SALARY_AUP',
            autoAup: true
        };
    }

    // 3. Приход без явного маркера
    if (type === 'income') {
        return {
            // 1С документы = начисление по акту, банк = оплата от клиента
            itemId: sourceType === '1c' ? 'CLIENT_REVENUE' : 'CLIENT_PAYMENT',
            autoAup: false
        };
    }

    // 4. Расход без маркера = ТМЦ (80% случаев)
    if (type === 'expense') {
        return {
            itemId: 'PAYMENT_FOR_TMC',
            autoAup: false
        };
    }

    return {
        itemId: null,
        autoAup: false
    };
}

/**
 * Определить статью с учетом типа операции (обратная совместимость)
 * @param purpose - назначение платежа
 * @param type - тип операции (income/expense)
 */
export function matchCostItemWithType(purpose: string, type: 'income' | 'expense'): string | null {
    const result = autoMatchTransaction(purpose, '', type);
    return result.itemId;
}
