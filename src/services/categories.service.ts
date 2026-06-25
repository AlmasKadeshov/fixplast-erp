import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    where,
    Timestamp,
    DocumentData,
    onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Category, CategoryInput, SYSTEM_CATEGORIES } from '../models/category';

const COLLECTION_NAME = 'categories';

function mapDocument(id: string, data: DocumentData): Category {
    return {
        id,
        name: data.name,
        type: data.type || 'expense',
        parentId: data.parentId,
        isSystem: data.isSystem ?? false,
        ddsCategory: data.ddsCategory || 'operational',
        opiuCategory: data.opiuCategory || 'ignore',
        sortOrder: data.sortOrder ?? 0,
        icon: data.icon,
        legacyItemId: data.legacyItemId,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const categoriesService = {
    /**
     * Получить все категории
     */
    async getAll(): Promise<Category[]> {
        const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Получить категории по типу (income/expense)
     */
    async getByType(type: 'income' | 'expense'): Promise<Category[]> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('type', '==', type),
            orderBy('sortOrder')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Получить категорию по ID
     */
    async getById(id: string): Promise<Category | null> {
        const docRef = doc(db, COLLECTION_NAME, id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        return mapDocument(docSnap.id, docSnap.data());
    },

    /**
     * Найти категорию по legacyItemId (для обратной совместимости)
     */
    async getByLegacyId(legacyItemId: string): Promise<Category | null> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('legacyItemId', '==', legacyItemId)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const d = snapshot.docs[0];
        return mapDocument(d.id, d.data());
    },

    /**
     * Создать категорию
     */
    async create(data: CategoryInput): Promise<Category> {
        const now = Timestamp.now();
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
     * Обновить категорию (не системную)
     */
    async update(id: string, data: Partial<CategoryInput>): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now(),
        });
    },

    /**
     * Удалить категорию (не системную)
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    /**
     * Засеять системные категории (idempotent)
     */
    async seedSystemCategories(): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;

        for (const cat of SYSTEM_CATEGORIES) {
            // Проверяем есть ли уже по legacyItemId
            const existing = await categoriesService.getByLegacyId(cat.legacyItemId!);
            if (existing) {
                skipped++;
                continue;
            }

            await categoriesService.create(cat);
            created++;
        }

        return { created, skipped };
    },

    /**
     * Подписка на realtime обновления
     */
    subscribe(callback: (categories: Category[]) => void): () => void {
        const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder'));
        return onSnapshot(q, (snapshot) => {
            const categories = snapshot.docs.map((d) => mapDocument(d.id, d.data()));
            callback(categories);
        });
    },
};
