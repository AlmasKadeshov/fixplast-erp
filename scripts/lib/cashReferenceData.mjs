/**
 * Справочники модуля «Касса» — единый источник правды для скриптов
 * seedCashDirectories.mjs и migrateCashHistory.mjs.
 *
 * Списки согласованы с владельцем. Типы категорий (income/expense) выведены
 * из фактического использования в файле истории «данные Настя (касса).xlsx»:
 * если категория встречается и в приходах, и в расходах — создаются ДВА
 * документа (модель Category допускает только один type на документ).
 */

// ============================================
// КОШЕЛЬКИ → коллекция accounts
// ============================================

/**
 * Тип счёта выводится из названия: банковские и карточные — по признаку
 * банка в скобках, остальное — наличная касса у подотчётного лица.
 */
function accountTypeFor(name) {
    if (/kaspiPay/i.test(name)) return { type: 'card', bankName: 'Kaspi' };
    if (/Jusan/i.test(name)) return { type: 'bank', bankName: 'Jusan' };
    if (/forte/i.test(name)) return { type: 'bank', bankName: 'ForteBank' };
    if (/Халык/i.test(name)) return { type: 'bank', bankName: 'Halyk' };
    return { type: 'cash' };
}

const WALLET_NAMES = [
    'касса_нал',
    'Данияр',
    'Асхат',
    'Александр',
    'Алмас Алматы',
    'Икром',
    'Настя',
    'Акежан',
    'Абылай',
    'Бахтияр',
    'Аскар',
    'Рустамжон',
    'Шавкат',
    'Диорбек М',
    'Азамат',
    'Сулейман',
    'Stonex (Jusan)',
    'Stonex (kaspiPay)',
    'Teplomax (Jusan)',
    'Teplomax (forte)',
    'Teplomax (kaspiPay)',
    'ИП Наурузбаев',
    'ИП Сатымбеков',
    'ИП TAU Company',
    'ИП Власенко',
    'Маргуба Халык',
    'Асхата Мама (Маргуба)',
    'Юра',
    'Алия',
    'Мухамедияр',
    'СЫРЫМ',
    'Бахтияр ИВАДИЛЛА',
];

export const ACCOUNTS = WALLET_NAMES.map((name, i) => ({
    name,
    ...accountTypeFor(name),
    currency: 'KZT',
    startingBalance: 0,
    isActive: true,
    sortOrder: i + 1,
}));

// ============================================
// КАТЕГОРИИ → коллекция categories
// ============================================

/** Раздел ДДС в файле истории → ddsCategory модели Category */
export const DDS_SECTION_MAP = {
    'ОПЕРАЦИОННАЯ': 'operational',
    'ИНВЕСТИЦИОННАЯ': 'investment',
    'ФИНАНСОВАЯ': 'financial',
};

/**
 * Себестоимость для ОПиУ. Остальные операционные расходы → opex,
 * операционные приходы → revenue, инвестиции и финансы → ignore.
 * Разметку ОПиУ владелец не задавал — проверить в dry-run.
 */
const COGS = new Set([
    'Закуп сырья',
    'Производственные материалы и обеспечение',
    'Себестоимость (Перекуп)',
    'Доставка от поставщиков',
    'Международная логистика (Китай)',
    'Перемещение между складами',
]);

/** Выручка и контр-выручка (возврат клиенту уменьшает выручку, а не opex) */
const REVENUE = new Set([
    'Оплата клиента',
    'Возврат оплаты клиенту',
]);

/** Категории, которые не участвуют в ОПиУ несмотря на операционный раздел ДДС */
const OPIU_IGNORED = new Set([
    'Внутренний перевод',
    'Конвертация безнал → нал',
]);

/**
 * ОПиУ определяется экономической ролью категории, а не типом документа:
 * у «зеркальных» категорий (есть и приход, и расход) оба документа получают
 * одну разметку, иначе редкие возвраты попадали бы в выручку.
 */
function opiuFor(name, dds) {
    if (dds !== 'operational') return 'ignore';
    if (OPIU_IGNORED.has(name)) return 'ignore';
    if (REVENUE.has(name)) return 'revenue';
    if (COGS.has(name)) return 'cogs';
    return 'opex';
}

/**
 * [название, раздел ДДС, типы]
 * types: какие документы создать — 'expense', 'income' или оба.
 */
const CATEGORY_DEFS = [
    // --- ОПЕРАЦИОННАЯ ---
    ['Оплата клиента', 'operational', ['income', 'expense']],
    ['Возврат оплаты клиенту', 'operational', ['expense', 'income']],
    ['Заработная плата', 'operational', ['expense', 'income']],
    ['KPI менеджеров', 'operational', ['expense']],
    ['Премии и бонусы', 'operational', ['expense']],
    ['Бонусы партнёрам / агентам', 'operational', ['expense']],
    ['Отчисления (ОПВ, СО и т.д.)', 'operational', ['expense']],
    ['Закуп сырья', 'operational', ['expense']],
    ['Производственные материалы и обеспечение', 'operational', ['expense', 'income']],
    ['Доставка по городу / межгород', 'operational', ['expense', 'income']],
    ['Доставка от поставщиков', 'operational', ['expense']],
    ['Международная логистика (Китай)', 'operational', ['expense']],
    ['Перемещение между складами', 'operational', ['expense']],
    ['Аренда и коммунальные услуги', 'operational', ['expense']],
    ['Коммунальные завода (банк)', 'operational', ['expense']],
    ['Расходы на офис', 'operational', ['expense', 'income']],
    ['Ремонт и обслуживание оборудования', 'operational', ['expense']],
    ['Масло / ГСМ / запчасти', 'operational', ['expense', 'income']],
    ['Обслуживание ПО', 'operational', ['expense']],
    // В файле истории написание с запятыми — берём его, иначе 181 строка не сматчится
    ['Питание, бельё, бытовые нужды персонала', 'operational', ['expense']],
    ['Такси для персонала', 'operational', ['expense']],
    ['Представительские расходы', 'operational', ['expense', 'income']],
    ['Маркетинговые услуги', 'operational', ['expense']],
    ['Налоги', 'operational', ['expense']],
    ['НДС', 'operational', ['expense']],
    ['Комиссии банка', 'operational', ['expense']],
    ['Юридические и нотариальные услуги', 'operational', ['expense']],
    ['Оформление авто / страховки / техосмотр', 'operational', ['expense']],
    ['Регистрация людей / ИИН / граница / миграция', 'operational', ['expense']],
    ['Таможенные услуги', 'operational', ['expense']],
    ['Таможенный сбор', 'operational', ['expense']],
    ['Мусор / экология', 'operational', ['expense']],
    ['Обучение и развитие сотрудников', 'operational', ['expense']],
    ['Курьерские / почтовые услуги', 'operational', ['expense']],
    ['Себестоимость (Перекуп)', 'operational', ['expense']],
    ['Комиссия за обналичку', 'operational', ['expense']],
    ['Внутренний перевод', 'operational', ['expense', 'income']],
    ['Прочее', 'operational', ['expense', 'income']],

    // --- ИНВЕСТИЦИОННАЯ ---
    ['Покупка ОС (Оборудования)', 'investment', ['expense']],
    ['Погашение рассрочки', 'investment', ['expense', 'income']],
    ['Расширение завода (новый завод)', 'investment', ['expense']],

    // --- ФИНАНСОВАЯ ---
    ['Взнос учредителя', 'financial', ['income']],
    ['Выемка учредителя', 'financial', ['expense']],
    ['Займы выданные', 'financial', ['expense']],
    ['Возврат займа выданного', 'financial', ['income']],
    ['Займы полученные', 'financial', ['income']],
    ['Возврат займа полученного', 'financial', ['expense']],
    ['Конвертация безнал → нал', 'financial', ['expense', 'income']],
];

/**
 * Категории, которые есть в файле истории, но отсутствуют в списке владельца.
 * Включаются по умолчанию (отключить: --no-extra), иначе соответствующие
 * строки будут пропущены при миграции.
 */
const EXTRA_CATEGORY_DEFS = [
    ['Покупка ОС — доставка/фрахт', 'investment', ['expense']],
    ['Покупка ОС — монтаж/пусконаладка', 'investment', ['expense']],
    ['Покупка ОС — таможня/брокер', 'investment', ['expense']],
    ['оптимизация расходов', 'operational', ['expense']],
];

function buildCategories(defs, startOrder, beyondOwnerList) {
    const out = [];
    let order = startOrder;
    for (const [name, dds, types] of defs) {
        for (const type of types) {
            out.push({
                name,
                type,
                isSystem: false,
                ddsCategory: dds,
                opiuCategory: opiuFor(name, dds),
                sortOrder: order++,
                beyondOwnerList,
            });
        }
    }
    return out;
}

export const CATEGORIES = buildCategories(CATEGORY_DEFS, 1, false);
export const EXTRA_CATEGORIES = buildCategories(EXTRA_CATEGORY_DEFS, 1000, true);

/** Ключ уникальности категории: название + тип */
export const categoryKey = (name, type) => `${name} ${type}`;
