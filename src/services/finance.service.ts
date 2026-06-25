import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    DocumentData,
    DocumentReference,
    QueryDocumentSnapshot,
    Query,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Transaction, TransactionFilters, TransactionSchema } from '../models/finance';
import { startOfDay, endOfDay } from '../utils/dateUtils';

// ============================================
// ТИПЫ ДЛЯ СВЕРКИ
// ============================================

export interface ReconciliationItem {
    hash: string;
    date: Date;
    amount: number;
    type: 'income' | 'expense';
    description: string;
    partner: string;
}

export interface ReconciliationResult {
    /** Транзакции из файла, которых НЕТ в БД */
    onlyInFile: ReconciliationItem[];
    /** Транзакции из БД (за этот период), которых НЕТ в файле */
    onlyInDb: ReconciliationItem[];
    /** Совпавшие (есть и там и там) */
    matched: number;
    /** Итоговая сумма по файлу */
    fileTotalIncome: number;
    fileTotalExpense: number;
    /** Итоговая сумма по БД за этот же период */
    dbTotalIncome: number;
    dbTotalExpense: number;
}

// ============================================
// КОЛЛЕКЦИИ
// ============================================

const COLLECTION = 'transactions';

// ============================================
// МАППИНГ ДОКУМЕНТОВ
// ============================================

function mapTransaction(id: string, data: DocumentData): Transaction {
    return {
        id,
        date: data.date,
        amount: Math.abs(data.amount || 0), // Нормализуем к положительному значению
        type: data.type || 'expense',
        status: data.status || 'fact',
        walletId: data.walletId || '',
        partnerId: data.partnerId || '',
        partnerBin: data.partnerBin || '',
        categoryId: data.categoryId || '',
        projectId: data.projectId || '',
        description: data.description || '',
        sourceDoc: data.sourceDoc || '',
        sourceType: data.sourceType || 'bank',
        accountingPeriod: data.accountingPeriod || '',
        vatAmount: data.vatAmount,
        hash: data.hash || '',
        createdBy: data.createdBy || '',
        recurrenceId: data.recurrenceId || '',
        recurrenceRule: data.recurrenceRule,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

// ============================================
// СЕРВИС ФИНАНСОВ
// ============================================

class FinanceService {
    /**
     * Batch-delete an array of document references in chunks of 500
     */
    private async batchDeleteRefs(refs: DocumentReference[]): Promise<void> {
        const BATCH_SIZE = 500;
        const commitPromises: Promise<void>[] = [];
        for (let i = 0; i < refs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            refs.slice(i, i + BATCH_SIZE).forEach(ref => batch.delete(ref));
            commitPromises.push(batch.commit());
        }
        await Promise.all(commitPromises);
    }

    /**
     * Создать транзакцию
     */
    async addTransaction(
        data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<string> {
        // Валидация данных
        const validated = TransactionSchema.parse(data);

        const now = Timestamp.now();
        const docData = {
            ...validated,
            amount: Math.abs(validated.amount), // Гарантируем положительное значение
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await addDoc(collection(db, COLLECTION), docData);
        return docRef.id;
    }

    /**
     * Получить транзакцию по ID
     */
    async getById(id: string): Promise<Transaction | null> {
        const docSnap = await getDoc(doc(db, COLLECTION, id));
        if (!docSnap.exists()) return null;
        return mapTransaction(docSnap.id, docSnap.data());
    }

    /**
     * Получить транзакции с фильтрацией
     */
    async getTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
        const constraints: ReturnType<typeof where>[] = [];

        if (filters.status) {
            constraints.push(where('status', '==', filters.status));
        }

        if (filters.type) {
            constraints.push(where('type', '==', filters.type));
        }

        if (filters.walletId) {
            constraints.push(where('walletId', '==', filters.walletId));
        }

        if (filters.projectId) {
            constraints.push(where('projectId', '==', filters.projectId));
        }

        if (filters.partnerId) {
            constraints.push(where('partnerId', '==', filters.partnerId));
        }

        if (filters.categoryId) {
            constraints.push(where('categoryId', '==', filters.categoryId));
        }

        if (filters.startDate) {
            // Используем startOfDay для корректной фильтрации с начала дня
            constraints.push(where('date', '>=', startOfDay(filters.startDate)));
        }

        if (filters.endDate) {
            // Используем endOfDay для включения всех записей до конца дня
            constraints.push(where('date', '<=', endOfDay(filters.endDate)));
        }

        const q = query(
            collection(db, COLLECTION),
            ...constraints,
            orderBy('date', 'desc')
        );

        // Загружаем ВСЕ документы постранично чтобы обойти лимит Firestore
        const PAGE_SIZE = 500;
        const allDocs: QueryDocumentSnapshot<DocumentData>[] = [];
        let lastVisible: QueryDocumentSnapshot<DocumentData> | null = null;

        while (true) {
            const pageQuery: Query<DocumentData> = lastVisible
                ? query(q, startAfter(lastVisible), limit(PAGE_SIZE))
                : query(q, limit(PAGE_SIZE));

            const snapshot = await getDocs(pageQuery);
            if (snapshot.empty) break;

            allDocs.push(...snapshot.docs);
            if (snapshot.docs.length < PAGE_SIZE) break;
            lastVisible = snapshot.docs[snapshot.docs.length - 1];
        }

        return allDocs.map((d) => mapTransaction(d.id, d.data()));
    }

    /**
     * Массовая загрузка транзакций (batch import) с дедупликацией по хешу
     * Firestore batch supports up to 500 operations
     */
    async batchImportTransactions(
        transactions: (Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { hash?: string })[]
    ): Promise<{ imported: number; skipped: number; batches: number }> {
        const BATCH_SIZE = 500;
        const now = Timestamp.now();
        let imported = 0;
        let skipped = 0;
        let batches = 0;

        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = transactions.slice(i, i + BATCH_SIZE);
            let operationsInBatch = 0;

            for (const transaction of chunk) {
                // Валидация каждой транзакции
                const validated = TransactionSchema.parse(transaction);

                // Дедупликация по хешу (если хеш есть)
                if (transaction.hash) {
                    const docRef = doc(db, COLLECTION, transaction.hash);
                    const docSnap = await getDoc(docRef);

                    if (docSnap.exists()) {
                        skipped++;
                        continue; // Пропускаем дубликат
                    }

                    // Сохраняем с хешем как ID документа
                    batch.set(docRef, {
                        ...validated,
                        hash: transaction.hash,
                        amount: Math.abs(validated.amount),
                        createdAt: now,
                        updatedAt: now,
                    });
                } else {
                    // Без хеша — просто создаём новый документ (старое поведение)
                    const docRef = doc(collection(db, COLLECTION));
                    batch.set(docRef, {
                        ...validated,
                        amount: Math.abs(validated.amount),
                        createdAt: now,
                        updatedAt: now,
                    });
                }

                operationsInBatch++;
                imported++;
            }

            if (operationsInBatch > 0) {
                await batch.commit();
            }
            batches++;
        }

        return { imported, skipped, batches };
    }

    /**
     * Импорт транзакций из 1С с дедупликацией по хешу
     */
    async save1CTransactions(
        transactions: (Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { hash: string })[]
    ): Promise<{ imported: number; skipped: number }> {
        let imported = 0;
        let skipped = 0;
        const now = Timestamp.now();
        const BATCH_SIZE = 500;

        // Process in chunks to respect batch limits
        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const chunk = transactions.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);
            let operationsInBatch = 0;

            // Sequential checks to avoid complexity with strict batch reads
            // For better performance we could use getAll() if using admin SDK, but here we iterate
            for (const t of chunk) {
                const docRef = doc(db, COLLECTION, t.hash);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    skipped++;
                } else {
                    const validated = TransactionSchema.parse(t);
                    batch.set(docRef, {
                        ...validated,
                        amount: Math.abs(validated.amount),
                        createdAt: now,
                        updatedAt: now,
                    });
                    operationsInBatch++;
                    imported++;
                }
            }

            if (operationsInBatch > 0) {
                await batch.commit();
            }
        }

        return { imported, skipped };
    }

    /**
     * Получить все транзакции по проекту
     */
    async getByProject(projectId: string): Promise<Transaction[]> {
        return this.getTransactions({ projectId });
    }

    /**
     * Получить сумму по проекту
     */
    async getTotalByProject(projectId: string): Promise<{ income: number; expense: number; balance: number }> {
        const transactions = await this.getByProject(projectId);

        let income = 0;
        let expense = 0;

        for (const t of transactions) {
            // amount уже положительный, просто суммируем
            if (t.type === 'income') {
                income += t.amount;
            } else {
                expense += t.amount;
            }
        }

        return {
            income,
            expense,
            balance: income - expense,
        };
    }
    /**
     * Очистка данных RDO (удаление всех транзакций с sourceDoc = 'RDO Migration')
     */
    async clearRdoTransactions(): Promise<number> {
        const q = query(
            collection(db, COLLECTION),
            where('sourceDoc', '==', 'RDO Migration')
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return 0;

        await this.batchDeleteRefs(snapshot.docs.map(d => d.ref));
        return snapshot.size;
    }

    /**
     * Очистка ВСЕХ транзакций (полный сброс данных)
     */
    async clearAllTransactions(): Promise<number> {
        const snapshot = await getDocs(collection(db, COLLECTION));
        if (snapshot.empty) return 0;

        await this.batchDeleteRefs(snapshot.docs.map(d => d.ref));
        return snapshot.size;
    }

    /**
     * Обновить транзакцию
     */
    async updateTransaction(
        id: string,
        updates: Partial<Omit<Transaction, 'date'>> & { date?: Date | Timestamp }
    ): Promise<void> {
        const docRef = doc(db, COLLECTION, id);
        const dataToUpdate: DocumentData = { ...updates, updatedAt: Timestamp.now() };

        // Convert dates if present
        if (updates.date instanceof Date) {
            dataToUpdate.date = Timestamp.fromDate(updates.date);
        } else if (updates.date instanceof Timestamp) {
            dataToUpdate.date = updates.date;
        }

        // Remove undefined fields
        Object.keys(dataToUpdate).forEach(key =>
            dataToUpdate[key] === undefined && delete dataToUpdate[key]
        );

        await updateDoc(docRef, dataToUpdate);
    }

    /**
     * Сверка банковской выписки с БД
     * Сравнивает транзакции из файла с тем что есть в Firestore за тот же период
     */
    async reconcileWithFile(
        fileTransactions: { hash: string; date: Date; amount: number; type: 'income' | 'expense'; description: string; partner: string }[],
        dateFrom: Date,
        dateTo: Date,
        sourceType?: 'bank' | '1c'
    ): Promise<ReconciliationResult> {
        // 1. Загружаем все транзакции из БД за указанный период
        const constraints: ReturnType<typeof where>[] = [
            where('date', '>=', startOfDay(dateFrom)),
            where('date', '<=', endOfDay(dateTo)),
        ];
        if (sourceType) {
            constraints.push(where('sourceType', '==', sourceType));
        }

        const q = query(collection(db, COLLECTION), ...constraints, orderBy('date', 'asc'));
        const snapshot = await getDocs(q);
        const dbDocs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));

        // 2. Строим Set хешей из БД (используем doc.id как хеш, т.к. он им и является)
        const dbHashSet = new Set<string>(dbDocs.map(d => d.id));

        // 3. Строим Set хешей из файла
        const fileHashSet = new Set<string>(fileTransactions.map(t => t.hash));

        // 4. Вычисляем расхождения
        const onlyInFile: ReconciliationItem[] = fileTransactions
            .filter(t => !dbHashSet.has(t.hash))
            .map(t => ({
                hash: t.hash,
                date: t.date,
                amount: t.amount,
                type: t.type,
                description: t.description,
                partner: t.partner,
            }));

        const onlyInDb: ReconciliationItem[] = dbDocs
            .filter(d => !fileHashSet.has(d.id))
            .map(d => ({
                hash: d.id,
                date: d.data.date?.toDate() ?? new Date(),
                amount: Math.abs(d.data.amount || 0),
                type: d.data.type || 'expense',
                description: d.data.description || '',
                partner: '',
            }));

        const matched = fileTransactions.length - onlyInFile.length;

        // 5. Считаем суммы
        const sum = (arr: { amount: number; type: string }[], t: string) =>
            arr.filter(x => x.type === t).reduce((s, x) => s + x.amount, 0);

        return {
            onlyInFile,
            onlyInDb,
            matched,
            fileTotalIncome: sum(fileTransactions, 'income'),
            fileTotalExpense: sum(fileTransactions, 'expense'),
            dbTotalIncome: sum(dbDocs.map(d => ({ amount: Math.abs(d.data.amount || 0), type: d.data.type || 'expense' })), 'income'),
            dbTotalExpense: sum(dbDocs.map(d => ({ amount: Math.abs(d.data.amount || 0), type: d.data.type || 'expense' })), 'expense'),
        };
    }

    /**
     * Получить все хеши транзакций за период (для быстрой проверки дублей файла)
     */
    async getHashesForPeriod(dateFrom: Date, dateTo: Date, sourceType?: 'bank' | '1c'): Promise<Set<string>> {
        const constraints: ReturnType<typeof where>[] = [
            where('date', '>=', startOfDay(dateFrom)),
            where('date', '<=', endOfDay(dateTo)),
        ];
        if (sourceType) {
            constraints.push(where('sourceType', '==', sourceType));
        }

        const q = query(collection(db, COLLECTION), ...constraints);
        const snapshot = await getDocs(q);
        return new Set(snapshot.docs.map(d => d.id));
    }

    /**
     * Удалить список транзакций (по ID)
     */
    async deleteTransactions(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await this.batchDeleteRefs(ids.map(id => doc(db, COLLECTION, id)));
    }
    /**
     * Миграция: обновить categoryId у 1С income транзакций
     * CLIENT_PAYMENT → CLIENT_REVENUE для sourceType='1c' + type='income'
     */
    async migrate1cIncomeCategory(): Promise<{ updated: number; total: number }> {
        const q = query(
            collection(db, COLLECTION),
            where('sourceType', '==', '1c'),
            where('type', '==', 'income')
        );
        const snapshot = await getDocs(q);

        let updated = 0;
        const batchSize = 500;
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.categoryId === 'CLIENT_PAYMENT') {
                batch.update(docSnap.ref, { categoryId: 'CLIENT_REVENUE' });
                batchCount++;
                updated++;

                if (batchCount >= batchSize) {
                    await batch.commit();
                    batch = writeBatch(db);
                    batchCount = 0;
                }
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        return { updated, total: snapshot.size };
    }

    /**
     * Миграция: обновить opiuCategory в costItems
     */
    async migrateCostItemsOpiuCategory(): Promise<void> {
        const updates: Record<string, string> = {
            'CLIENT_PAYMENT': 'IGNORE',
            'SALARY_AUP': 'OPEX',
        };

        const batch = writeBatch(db);
        for (const [itemId, newOpiuCategory] of Object.entries(updates)) {
            const docRef = doc(db, 'costItems', itemId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                batch.update(docRef, { opiuCategory: newOpiuCategory });
            }
        }
        await batch.commit();
    }
}

export const financeService = new FinanceService();
