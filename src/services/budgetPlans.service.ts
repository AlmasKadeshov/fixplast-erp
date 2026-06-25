import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    Timestamp,
    DocumentData,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { BudgetPlan, BudgetPlanInput } from '../models/budgetPlan';

const COLLECTION_NAME = 'budgetPlans';

function mapDocument(id: string, data: DocumentData): BudgetPlan {
    return {
        id,
        year: data.year,
        month: data.month,
        type: data.type,
        categoryId: data.categoryId,
        projectId: data.projectId,
        plannedAmount: data.plannedAmount ?? 0,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const budgetPlansService = {
    /**
     * Получить бюджеты за конкретный месяц
     */
    async getByMonth(year: number, month: number): Promise<BudgetPlan[]> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('year', '==', year),
            where('month', '==', month)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Получить бюджеты за год
     */
    async getByYear(year: number): Promise<BudgetPlan[]> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('year', '==', year)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Создать/обновить бюджет
     */
    async upsert(data: BudgetPlanInput): Promise<BudgetPlan> {
        // Ищем существующий по year+month+categoryId+projectId
        const constraints = [
            where('year', '==', data.year),
            where('month', '==', data.month),
            where('categoryId', '==', data.categoryId),
        ];

        const q = query(collection(db, COLLECTION_NAME), ...constraints);
        const snapshot = await getDocs(q);

        // Фильтруем по projectId (может быть undefined)
        const existing = snapshot.docs.find((d) => {
            const docData = d.data();
            return (docData.projectId || '') === (data.projectId || '');
        });

        const now = Timestamp.now();

        if (existing) {
            await updateDoc(existing.ref, {
                plannedAmount: data.plannedAmount,
                type: data.type,
                updatedAt: now,
            });
            return mapDocument(existing.id, { ...existing.data(), plannedAmount: data.plannedAmount, updatedAt: now });
        }

        const docRef = await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            createdAt: now,
            updatedAt: now,
        });

        return {
            ...data,
            id: docRef.id,
            createdAt: now.toDate(),
            updatedAt: now.toDate(),
        };
    },

    /**
     * Удалить бюджет
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    /**
     * Копировать бюджет из предыдущего месяца
     */
    async copyFromPreviousMonth(year: number, month: number): Promise<number> {
        const prevMonth = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;

        const source = await budgetPlansService.getByMonth(prevYear, prevMonth);
        if (source.length === 0) return 0;

        const BATCH_SIZE = 500;
        let copied = 0;

        for (let i = 0; i < source.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = source.slice(i, i + BATCH_SIZE);
            const now = Timestamp.now();

            for (const plan of chunk) {
                const newRef = doc(collection(db, COLLECTION_NAME));
                batch.set(newRef, {
                    year,
                    month,
                    type: plan.type,
                    categoryId: plan.categoryId,
                    projectId: plan.projectId || null,
                    plannedAmount: plan.plannedAmount,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            await batch.commit();
            copied += chunk.length;
        }

        return copied;
    },
};
