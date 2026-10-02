#!/usr/bin/env node
/**
 * Разовый скрипт: миграция истории кассовых операций из xlsx в Firestore.
 *
 * Источник: лист «Сделки», колонки
 *   Дата | Тип | Кошелёк ОТ | Кошелёк К | Сумма | Категория | Комментарий | Раздел ДДС
 *
 * Маппинг на модель Transaction — тот же, что в CashOperationModal.tsx:
 *   расход  → type=expense,  accountId = Кошелёк ОТ
 *   приход  → type=income,   accountId = Кошелёк К
 *   перевод → type=transfer, accountId = Кошелёк ОТ, accountToId = Кошелёк К
 *
 * Кошельки и категории матчатся ТОЧНЫМ совпадением названия. Если совпадения
 * нет — строка пропускается и логируется, новые справочники не создаются.
 *
 * Запуск:
 *   node scripts/migrateCashHistory.mjs                       # dry-run
 *   SERVICE_ACCOUNT=key.json node scripts/migrateCashHistory.mjs --apply
 *
 * Флаги:
 *   --apply           реальная запись в Firestore (по умолчанию dry-run)
 *   --file=<путь>     путь к xlsx
 *   --created-by=<uid>  uid автора записей
 *   --no-extra        не использовать категории сверх списка владельца
 *   --verbose         печатать каждую пропущенную строку
 */
import { createRequire } from 'node:module';
import { ACCOUNTS, CATEGORIES, EXTRA_CATEGORIES } from './lib/cashReferenceData.mjs';
import { getFirestore, projectId, credentialsPath, commitInChunks } from './lib/firestoreAdmin.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ============================================
// АРГУМЕНТЫ
// ============================================

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const hit = argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const WITH_EXTRA = !argv.includes('--no-extra');
const FILE = flag('file', '/Users/almas.kadeshov/Downloads/данные Настя ( касса).xlsx');
const SHEET = flag('sheet', 'Сделки');
/** uid владельца — firestore.rules разрешают правку своих записей по createdBy */
let CREATED_BY = flag('created-by', process.env.MIGRATION_UID || '');
/** Если uid не задан — ищем его в Firebase Auth по email владельца */
const CREATED_BY_EMAIL = flag('created-by-email', process.env.MIGRATION_EMAIL || 'almaskadeshov@gmail.com');

const TYPE_MAP = { 'расход': 'expense', 'приход': 'income', 'перевод': 'transfer' };

// ============================================
// ХЕЛПЕРЫ
// ============================================

/** Excel serial → Date (UTC-полночь, эпоха 1899-12-30) */
function excelSerialToDate(serial) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
}

function parseDate(value) {
    if (typeof value === 'number') return excelSerialToDate(value);
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
        const m = value.trim().match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
        if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
}

/** Та же логика, что при обычном создании операции: будущая дата → plan */
function statusFromDate(date) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date > today ? 'plan' : 'fact';
}

const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
const pad = (s, n) => String(s).padEnd(n);

// ============================================
// СПРАВОЧНИКИ
// ============================================

/**
 * Кошельки и категории берутся из Firestore, если есть доступ,
 * иначе — из плановых списков (тогда dry-run считает по будущему состоянию).
 */
async function loadDirectories() {
    if (!credentialsPath()) {
        const cats = WITH_EXTRA ? [...CATEGORIES, ...EXTRA_CATEGORIES] : CATEGORIES;
        return {
            source: 'план засева (scripts/lib/cashReferenceData.mjs)',
            accounts: new Map(ACCOUNTS.map(a => [a.name, `<план:${a.name}>`])),
            categories: new Map(cats.map(c => [`${c.name} ${c.type}`, `<план:${c.name}/${c.type}>`])),
        };
    }

    const db = await getFirestore();
    const [accSnap, catSnap] = await Promise.all([
        db.collection('accounts').get(),
        db.collection('categories').get(),
    ]);
    const accounts = new Map();
    accSnap.forEach(d => accounts.set(d.data().name, d.id));
    const categories = new Map();
    catSnap.forEach(d => {
        const v = d.data();
        categories.set(`${v.name} ${v.type}`, d.id);
    });
    return { source: `Firestore (${projectId()})`, accounts, categories, db };
}

// ============================================
// РАЗБОР СТРОК
// ============================================

function buildOperations(rows, dirs) {
    const ready = [];
    const skipped = [];
    const missingAccounts = new Map();
    const missingCategories = new Map();

    rows.forEach((row, i) => {
        const line = i + 2; // +1 заголовок, +1 нумерация с единицы
        const skip = (reason, detail) => skipped.push({ line, reason, detail, row });

        const rawType = String(row['Тип'] || '').trim().toLowerCase();
        const type = TYPE_MAP[rawType];
        if (!type) return skip('неизвестный тип', rawType || '<пусто>');

        const date = parseDate(row['Дата']);
        if (!date) return skip('не разобрана дата', String(row['Дата']));

        const amount = Math.abs(Number(row['Сумма']) || 0);
        if (!amount) return skip('нулевая или нечисловая сумма', String(row['Сумма']));

        const from = row['Кошелёк ОТ'] ? String(row['Кошелёк ОТ']).trim() : '';
        const to = row['Кошелёк К'] ? String(row['Кошелёк К']).trim() : '';

        // Какой кошелёк является счётом операции — по типу
        const primary = type === 'income' ? to : from;
        const secondary = type === 'transfer' ? to : '';

        if (!primary) {
            return skip(
                'не заполнен кошелёк',
                type === 'income' ? 'приход без «Кошелёк К»' : 'расход/перевод без «Кошелёк ОТ»'
            );
        }
        if (type === 'transfer' && !secondary) return skip('не заполнен кошелёк', 'перевод без «Кошелёк К»');

        const accountId = dirs.accounts.get(primary);
        if (!accountId) {
            missingAccounts.set(primary, (missingAccounts.get(primary) || 0) + 1);
            return skip('не найден кошелёк', primary);
        }
        let accountToId = null;
        if (type === 'transfer') {
            accountToId = dirs.accounts.get(secondary);
            if (!accountToId) {
                missingAccounts.set(secondary, (missingAccounts.get(secondary) || 0) + 1);
                return skip('не найден кошелёк', secondary);
            }
            if (accountId === accountToId) return skip('перевод сам в себя', primary);
        }

        // Категория: у переводов её нет — как и при создании операции в UI
        let categoryId = '';
        if (type !== 'transfer') {
            const name = String(row['Категория'] || '').trim();
            if (!name) return skip('не заполнена категория', '<пусто>');
            const key = `${name} ${type}`;
            categoryId = dirs.categories.get(key);
            if (!categoryId) {
                missingCategories.set(key, (missingCategories.get(key) || 0) + 1);
                return skip('не найдена категория', `${name} (${type})`);
            }
        }

        ready.push({
            line,
            date,
            amount,
            type,
            status: statusFromDate(date),
            accountId,
            accountToId,
            walletName: primary,
            categoryId,
            description: row['Комментарий'] ? String(row['Комментарий']).trim() : '',
        });
    });

    return { ready, skipped, missingAccounts, missingCategories };
}

/** Документ transactions — поля те же, что пишет CashOperationModal */
function toDocument(op, Timestamp) {
    const ts = Timestamp ? Timestamp.fromDate(op.date) : op.date;
    return {
        date: ts,
        paymentDate: ts,
        accrualDateFrom: null,
        accrualDateTo: null,
        amount: op.amount,
        type: op.type,
        status: op.status,
        accountId: op.accountId,
        accountToId: op.accountToId,
        walletId: op.walletName,
        partnerId: '',
        partnerBin: '',
        projectId: '',
        categoryId: op.categoryId,
        tagIds: [],
        description: op.description,
        sourceDoc: 'Касса (импорт истории)',
        sourceType: 'manual',
        currency: 'KZT',
        exchangeRate: 1,
        transferCommission: null,
        createdBy: CREATED_BY,
    };
}

// ============================================
// ОТЧЁТ
// ============================================

function report(rows, result, dirs) {
    const { ready, skipped, missingAccounts, missingCategories } = result;

    const totals = { income: 0, expense: 0, transfer: 0 };
    const counts = { income: 0, expense: 0, transfer: 0 };
    for (const op of ready) {
        totals[op.type] += op.amount;
        counts[op.type] += 1;
    }

    // Итоги по исходному файлу — для сверки
    const src = { 'приход': 0, 'расход': 0, 'перевод': 0 };
    const srcCount = { 'приход': 0, 'расход': 0, 'перевод': 0 };
    for (const r of rows) {
        const t = String(r['Тип'] || '').trim().toLowerCase();
        if (t in src) { src[t] += Math.abs(Number(r['Сумма']) || 0); srcCount[t] += 1; }
    }

    console.log(`\nИсточник справочников: ${dirs.source}`);
    console.log(`Кошельков в справочнике: ${dirs.accounts.size}, категорий: ${dirs.categories.size}`);

    console.log(`\n=== СВОДКА ===`);
    console.log(`Всего строк в файле:      ${rows.length}`);
    console.log(`Перенесено успешно:       ${ready.length}`);
    console.log(`Пропущено:                ${skipped.length}`);

    console.log(`\n=== ПРИЧИНЫ ПРОПУСКА ===`);
    const byReason = new Map();
    for (const s of skipped) byReason.set(s.reason, (byReason.get(s.reason) || 0) + 1);
    if (!byReason.size) console.log('  нет');
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${pad(reason, 28)} ${n}`);
    }

    if (missingAccounts.size) {
        console.log(`\n  Не найдены кошельки:`);
        for (const [name, n] of [...missingAccounts].sort((a, b) => b[1] - a[1])) {
            console.log(`    |${name}|  строк: ${n}`);
        }
    }
    if (missingCategories.size) {
        console.log(`\n  Не найдены категории (название + тип):`);
        for (const [key, n] of [...missingCategories].sort((a, b) => b[1] - a[1])) {
            console.log(`    |${key}|  строк: ${n}`);
        }
    }
    if (VERBOSE && skipped.length) {
        console.log(`\n  Построчно:`);
        for (const s of skipped) {
            console.log(`    строка ${s.line}: ${s.reason} — ${s.detail}`);
        }
    }

    console.log(`\n=== СУММЫ ДЛЯ СВЕРКИ ===`);
    console.log('  ' + pad('', 12) + pad('В ФАЙЛЕ', 22) + pad('К ПЕРЕНОСУ', 22) + 'РАЗНИЦА');
    const line = (label, srcKey, key) => {
        const diff = src[srcKey] - totals[key];
        console.log(
            '  ' + pad(label, 12) +
            pad(`${fmt(src[srcKey])} (${srcCount[srcKey]})`, 22) +
            pad(`${fmt(totals[key])} (${counts[key]})`, 22) +
            (diff ? fmt(diff) : '—')
        );
    };
    line('приход', 'приход', 'income');
    line('расход', 'расход', 'expense');
    line('перевод', 'перевод', 'transfer');
    console.log(`\n  Сальдо к переносу (приход − расход): ${fmt(totals.income - totals.expense)}`);

    const plan = ready.filter(o => o.status === 'plan').length;
    if (plan) console.log(`\n  Со статусом plan (дата в будущем): ${plan}, fact: ${ready.length - plan}`);
    else console.log(`\n  Все операции со статусом fact.`);

    if (ready.length) {
        const dates = ready.map(o => o.date.getTime());
        const iso = (t) => new Date(t).toISOString().slice(0, 10);
        console.log(`  Период: ${iso(Math.min(...dates))} — ${iso(Math.max(...dates))}`);
    }
}

// ============================================
// MAIN
// ============================================

const wb = XLSX.readFile(FILE);
if (!wb.SheetNames.includes(SHEET)) {
    console.error(`Лист «${SHEET}» не найден. Есть: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { raw: true, defval: null });

console.log(`Файл:  ${FILE}`);
console.log(`Лист:  ${SHEET}  (${rows.length} строк данных)`);
console.log(`Режим: ${APPLY ? 'ЗАПИСЬ В FIRESTORE' : 'DRY-RUN'}`);

const dirs = await loadDirectories();
const result = buildOperations(rows, dirs);
report(rows, result, dirs);

if (!APPLY) {
    console.log('\n--- DRY-RUN, в Firestore ничего не записано ---');
    if (!credentialsPath()) {
        console.log('Справочники взяты из плана засева: реальные ID подставятся после');
        console.log('прогона scripts/seedCashDirectories.mjs --apply.');
    }
    console.log('Для записи: SERVICE_ACCOUNT=key.json node scripts/migrateCashHistory.mjs --apply');
    process.exit(0);
}

if (!result.ready.length) {
    console.error('\nНечего переносить.');
    process.exit(1);
}

const db = dirs.db || await getFirestore();

if (!CREATED_BY) {
    try {
        const { getAuth } = await import('firebase-admin/auth');
        const user = await getAuth().getUserByEmail(CREATED_BY_EMAIL);
        CREATED_BY = user.uid;
        console.log(`createdBy: ${CREATED_BY} (${CREATED_BY_EMAIL})`);
    } catch {
        console.error(`\nНе удалось определить uid по email ${CREATED_BY_EMAIL}.`);
        console.error('Укажите явно: --created-by=<uid>');
        process.exit(1);
    }
}

const { Timestamp } = await import('firebase-admin/firestore');
const now = new Date();
const ops = result.ready.map(op => ({
    ref: db.collection('transactions').doc(),
    data: { ...toDocument(op, Timestamp), createdAt: now, updatedAt: now },
    merge: false,
}));

console.log(`\nЗапись ${ops.length} транзакций в ${projectId()}…`);
await commitInChunks(db, ops);
console.log('Готово.');
