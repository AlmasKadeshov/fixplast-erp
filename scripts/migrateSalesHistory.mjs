#!/usr/bin/env node
/**
 * Разовый скрипт: миграция истории продаж (юр.лица + физ.лица) из 1С-выгрузок
 * в Firestore-коллекцию transactions, как type: 'income'.
 *
 * Источники (лист с фиксированными колонками):
 *   1) юр.лица  — лист «Продажи_1С», колонки:
 *      Период | Компания | Менеджер | Контрагент | Тип клиента | Номенклатура |
 *      Кол-во | Возврат | Сумма с НДС | НДС | Сумма без НДС | Цена за ед.
 *   2) физ.лица — лист «Продажи_1С_физлица», колонки:
 *      Период | Компания | Менеджер | Контрагент | Номенклатура | Кол-во |
 *      Сумма | Цена за ед.
 *      (в этом файле НДС не выделяется отдельной колонкой — у физлиц его нет
 *      в выгрузке, поэтому vatAmount для этих строк = 0, это не расчёт,
 *      а отражение отсутствия данных в источнике)
 *
 * «Период» — месяц (YYYY-MM), не конкретный день. Дата транзакции берётся
 * как 1-е число месяца; accrualDateFrom/accrualDateTo — границы месяца
 * (именно для этого в модели Transaction есть эти v2-поля — период
 * начисления для ОПиУ). accountingPeriod = исходная строка "YYYY-MM".
 *
 * amount — «Сумма без НДС» (юр.лица) или «Сумма» (физ.лица). Если после
 * учёта возврата чистая сумма строки отрицательна (5 строк в файле
 * юр.лиц — частичный/полный возврат, превышающий продажу за период),
 * amount переносится СО ЗНАКОМ (отрицательным), чтобы не искажать сумму
 * выручки в большую сторону — это единственный способ сохранить и
 * буквальное указание "type: income для всех строк", и корректную сумму.
 * Строки с нулевой суммой (полный возврат без остатка) пропускаются —
 * это исключает нулевые проводки без экономического смысла.
 *
 * accountId НЕ указывается — продажа - это факт реализации (по 1С),
 * а не движение по счёту. walletId (legacy обязательное поле в TS-типе)
 * пишется как '' — это никогда не создаёт проблем при чтении (см. модель
 * Account.getAccountId), но не путается ни с одним реальным счётом.
 *
 * Категория: одна общая для revenue — ищется в Firestore по
 * (type: 'income' AND opiuCategory: 'revenue'); если не найдена —
 * создаётся с name: 'Оплата клиента' (то же название, что и в плановом
 * справочнике кассы, чтобы не плодить дубликаты), ddsCategory: 'operational',
 * opiuCategory: 'revenue' — как указано в задаче.
 *
 * ВАЖНО (для сверки перед --apply): у этой категории ddsCategory =
 * 'operational' — то есть эти строки попадут и в ДДС-отчёт как денежный
 * приток за месяц продажи, хотя реального движения денег в этот момент
 * не было (это же 1С-реализация, а не банковская выписка). Когда позже
 * будет мигрирован журнал_банк.xlsx с реальными поступлениями от клиентов,
 * возможно задвоение по ДДС — этот момент нужно будет решить отдельно
 * (например, отдельная категория для ДДС-цели или фильтр по sourceType).
 *
 * Запуск:
 *   node scripts/migrateSalesHistory.mjs                       # dry-run
 *   SERVICE_ACCOUNT=key.json node scripts/migrateSalesHistory.mjs --apply
 *
 * Флаги:
 *   --apply                  реальная запись в Firestore (по умолчанию dry-run)
 *   --file-legal=<путь>      путь к xlsx юр.лиц (по умолчанию дизайн/1с_продажа.xlsx)
 *   --file-physical=<путь>   путь к xlsx физ.лиц (по умолчанию «дизайн/физ лица продажа.xlsx»)
 *   --created-by=<uid>       uid автора записей
 *   --verbose                печатать построчно пропущенные/отрицательные строки
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
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
const FILE_LEGAL = flag('file-legal', 'дизайн/1с_продажа.xlsx');
const FILE_PHYSICAL = flag('file-physical', 'дизайн/физ лица продажа.xlsx');
/** uid владельца — firestore.rules разрешают правку своих записей по createdBy */
let CREATED_BY = flag('created-by', process.env.MIGRATION_UID || '');
const CREATED_BY_EMAIL = flag('created-by-email', process.env.MIGRATION_EMAIL || 'almaskadeshov@gmail.com');

const REVENUE_CATEGORY_NAME = 'Оплата клиента';

// ============================================
// ХЕЛПЕРЫ
// ============================================

/** "2026-01" -> { year: 2026, month: 1 } */
function parsePeriod(value) {
    const m = String(value || '').trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { year, month };
}

function monthStart(year, month) {
    return new Date(Date.UTC(year, month - 1, 1));
}

/** Последний день месяца (day=0 следующего месяца в UTC) */
function monthEnd(year, month) {
    return new Date(Date.UTC(year, month, 0));
}

const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
const pad = (s, n) => String(s).padEnd(n);
const num = (v) => (v == null ? 0 : Number(v) || 0);
const str = (v) => (v == null ? '' : String(v).trim());

function md5(s) {
    return createHash('md5').update(s).digest('hex');
}

// ============================================
// СПРАВОЧНИК КАТЕГОРИИ (revenue)
// ============================================

/**
 * Ищет в Firestore КОНКРЕТНУЮ категорию (name='Оплата клиента', type=income,
 * opiuCategory=revenue). Важно: opiuCategory='revenue' в этом справочнике
 * НЕ уникален — есть минимум две категории с этой классификацией:
 * «Оплата клиента» (основная выручка) и «Возврат оплаты клиенту» (её
 * зеркальная категория для рефандов, opiuFor() в cashReferenceData.mjs
 * помечает обе как revenue). Матчить только по opiuCategory без имени —
 * ошибка: первая попавшаяся при обходе снапшота может оказаться категорией
 * возвратов, и вся выручка от продаж уедет туда. Поэтому матчим по имени.
 *
 * Без доступа к Firestore (нет SERVICE_ACCOUNT) — считаем, что категории
 * ещё нет, и это будет отражено в dry-run отчёте как «будет создана».
 */
async function resolveRevenueCategory() {
    if (!credentialsPath()) {
        return { source: 'нет доступа к Firestore (нет SERVICE_ACCOUNT)', id: null, willCreate: true, db: null };
    }

    const db = await getFirestore();
    const snap = await db.collection('categories').get();
    const allRevenue = [];
    let found = null;
    snap.forEach(d => {
        const v = d.data();
        if (v.type === 'income' && v.opiuCategory === 'revenue') {
            allRevenue.push({ id: d.id, name: v.name });
            if (v.name === REVENUE_CATEGORY_NAME) found = { id: d.id, name: v.name };
        }
    });

    if (found) {
        return { source: `Firestore (${projectId()})`, id: found.id, name: found.name, willCreate: false, db, allRevenue };
    }
    return { source: `Firestore (${projectId()})`, id: null, willCreate: true, db, allRevenue };
}

async function ensureRevenueCategory(resolved) {
    if (resolved.id) return resolved.id;
    if (!resolved.db) {
        throw new Error('Нет доступа к Firestore — категорию нельзя создать без SERVICE_ACCOUNT.');
    }
    const now = new Date();
    const ref = resolved.db.collection('categories').doc();
    await ref.set({
        name: REVENUE_CATEGORY_NAME,
        type: 'income',
        isSystem: false,
        ddsCategory: 'operational',
        opiuCategory: 'revenue',
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
    });
    console.log(`  Создана категория «${REVENUE_CATEGORY_NAME}» (${ref.id})`);
    return ref.id;
}

// ============================================
// РАЗБОР СТРОК
// ============================================

/**
 * @param rows строки листа
 * @param opts { source: 'legal'|'physical', hasVat: boolean }
 */
function buildOperations(rows, opts) {
    const ready = [];
    const skippedZero = [];
    const skippedBadPeriod = [];
    const negative = [];

    rows.forEach((row, i) => {
        const line = i + 2; // +1 заголовок, +1 нумерация с единицы

        const period = parsePeriod(row['Период']);
        if (!period) {
            skippedBadPeriod.push({ line, value: row['Период'] });
            return;
        }

        const amountWithVat = opts.hasVat ? num(row['Сумма с НДС']) : num(row['Сумма']);
        const vat = opts.hasVat ? num(row['НДС']) : 0;
        const amountNet = opts.hasVat ? num(row['Сумма без НДС']) : num(row['Сумма']);

        if (amountNet === 0 && amountWithVat === 0) {
            skippedZero.push({ line });
            return;
        }

        const company = str(row['Компания']);
        const manager = str(row['Менеджер']);
        const counterparty = str(row['Контрагент']);
        const nomenclature = str(row['Номенклатура']);
        const quantity = num(row['Кол-во']);

        const date = monthStart(period.year, period.month);
        const dateEnd = monthEnd(period.year, period.month);
        const accountingPeriod = `${period.year}-${String(period.month).padStart(2, '0')}`;

        const op = {
            line,
            source: opts.source,
            date,
            dateEnd,
            accountingPeriod,
            amount: amountNet,
            vatAmount: vat,
            company,
            manager,
            counterparty,
            nomenclature,
            quantity,
        };

        if (amountNet < 0) negative.push(op);
        ready.push(op);
    });

    return { ready, skippedZero, skippedBadPeriod, negative };
}

/** Документ transactions */
function toDocument(op, categoryId, Timestamp) {
    const dateTs = Timestamp.fromDate(op.date);
    const desc = [op.company, op.manager, op.counterparty, op.nomenclature]
        .filter(Boolean)
        .join(' · ');
    return {
        date: dateTs,
        accrualDateFrom: Timestamp.fromDate(op.date),
        accrualDateTo: Timestamp.fromDate(op.dateEnd),
        amount: op.amount,
        type: 'income',
        status: 'fact',
        walletId: '',
        partnerId: '',
        partnerBin: '',
        projectId: '',
        categoryId,
        tagIds: [],
        description: desc,
        sourceDoc: op.source === 'legal'
            ? '1С Продажи (юр.лица) — импорт истории'
            : '1С Продажи (физ.лица) — импорт истории',
        sourceType: '1c',
        currency: 'KZT',
        exchangeRate: 1,
        transferCommission: null,
        accountingPeriod: op.accountingPeriod,
        vatAmount: op.vatAmount,
        hash: md5(`sales|${op.source}|${op.line}|${op.accountingPeriod}|${op.counterparty}|${op.nomenclature}|${op.quantity}|${op.amount}`),
        createdBy: CREATED_BY,
    };
}

// ============================================
// ОТЧЁТ
// ============================================

function reportFile(label, rows, result) {
    const { ready, skippedZero, skippedBadPeriod, negative } = result;
    console.log(`\n--- ${label} ---`);
    console.log(`  Строк в файле:        ${rows.length}`);
    console.log(`  К переносу:           ${ready.length}`);
    console.log(`  Пропущено (сумма=0):  ${skippedZero.length}`);
    if (skippedBadPeriod.length) {
        console.log(`  Не разобран период:   ${skippedBadPeriod.length}`);
    }
    if (negative.length) {
        console.log(`  Отрицательная сумма (частичный/полный возврат сверх продаж за период): ${negative.length}`);
        for (const n of negative) {
            console.log(`    строка ${n.line}: ${n.counterparty} — ${n.nomenclature} = ${fmt(n.amount)} (НДС ${fmt(n.vatAmount)})`);
        }
    }
    if (VERBOSE && skippedZero.length) {
        console.log('  Пропущенные (сумма=0) строки:', skippedZero.map(s => s.line).join(', '));
    }

    const sums = ready.reduce((acc, r) => {
        acc.net += r.amount;
        acc.vat += r.vatAmount;
        return acc;
    }, { net: 0, vat: 0 });

    console.log(`  Сумма без НДС (к переносу): ${fmt(sums.net)}`);
    console.log(`  НДС (к переносу):           ${fmt(sums.vat)}`);
    console.log(`  Сумма с НДС (net + vat):    ${fmt(sums.net + sums.vat)}`);

    if (ready.length) {
        const dates = ready.map(o => o.date.getTime());
        const iso = (t) => new Date(t).toISOString().slice(0, 7);
        console.log(`  Период: ${iso(Math.min(...dates))} — ${iso(Math.max(...dates))}`);
    }

    return sums;
}

// ============================================
// MAIN
// ============================================

function readSheet(file, expectedSheetPrefix) {
    const wb = XLSX.readFile(file);
    const sheetName = wb.SheetNames.find(n => n.startsWith(expectedSheetPrefix)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { raw: true, defval: null });
    return { sheetName, rows };
}

console.log(`Режим: ${APPLY ? 'ЗАПИСЬ В FIRESTORE' : 'DRY-RUN'}`);

const { sheetName: sheetLegal, rows: rowsLegal } = readSheet(FILE_LEGAL, 'Продажи_1С');
console.log(`\nЮр.лица:  ${FILE_LEGAL}  (лист «${sheetLegal}», ${rowsLegal.length} строк)`);

const { sheetName: sheetPhys, rows: rowsPhys } = readSheet(FILE_PHYSICAL, 'Продажи_1С_физлица');
console.log(`Физ.лица: ${FILE_PHYSICAL}  (лист «${sheetPhys}», ${rowsPhys.length} строк)`);

const resultLegal = buildOperations(rowsLegal, { source: 'legal', hasVat: true });
const resultPhys = buildOperations(rowsPhys, { source: 'physical', hasVat: false });

const catResolved = await resolveRevenueCategory();
console.log(`\nКатегория revenue: источник — ${catResolved.source}`);
if (catResolved.allRevenue?.length) {
    console.log(`  Всего категорий (type=income, opiuCategory=revenue) в базе: ${catResolved.allRevenue.length}`);
    for (const c of catResolved.allRevenue) console.log(`    - «${c.name}» (${c.id})`);
}
if (catResolved.willCreate) {
    console.log(`  Категория «${REVENUE_CATEGORY_NAME}» (type=income, opiuCategory=revenue) НЕ найдена — будет создана.`);
} else {
    console.log(`  Используется: «${catResolved.name}» (${catResolved.id})`);
}

console.log('\n=== СВОДКА ===');
const sumsLegal = reportFile(`Юр.лица (${sheetLegal})`, rowsLegal, resultLegal);
const sumsPhys = reportFile(`Физ.лица (${sheetPhys})`, rowsPhys, resultPhys);

console.log('\n--- ИТОГО (оба файла) ---');
console.log('  ' + pad('', 16) + pad('Сумма без НДС', 20) + pad('НДС', 20) + 'Сумма с НДС');
console.log(
    '  ' + pad('к переносу', 16) +
    pad(fmt(sumsLegal.net + sumsPhys.net), 20) +
    pad(fmt(sumsLegal.vat + sumsPhys.vat), 20) +
    fmt(sumsLegal.net + sumsPhys.net + sumsLegal.vat + sumsPhys.vat)
);
console.log(`  Всего транзакций к переносу: ${resultLegal.ready.length + resultPhys.ready.length}`);

if (!APPLY) {
    console.log('\n--- DRY-RUN, в Firestore ничего не записано ---');
    console.log('Для записи: SERVICE_ACCOUNT=key.json node scripts/migrateSalesHistory.mjs --apply');
    process.exit(0);
}

const allReady = [...resultLegal.ready, ...resultPhys.ready];
if (!allReady.length) {
    console.error('\nНечего переносить.');
    process.exit(1);
}

const db = catResolved.db || await getFirestore();

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

const categoryId = await ensureRevenueCategory({ ...catResolved, db });

const { Timestamp } = await import('firebase-admin/firestore');
const now = new Date();
const ops = allReady.map(op => {
    const data = toDocument(op, categoryId, Timestamp);
    return {
        ref: db.collection('transactions').doc(data.hash),
        data: { ...data, createdAt: now, updatedAt: now },
        merge: false,
    };
});

console.log(`\nЗапись ${ops.length} транзакций в ${projectId()}…`);
await commitInChunks(db, ops);
console.log('Готово.');
