import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    Timestamp,
    DocumentData,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { CostItem, COST_ITEMS_SEED } from '../models/costItems';

const COLLECTION_NAME = 'costItems';

function mapDocument(id: string, data: DocumentData): CostItem {
    return {
        id,
        itemId: data.itemId,
        itemName: data.itemName,
        ddsCategory: data.ddsCategory,
        opiuCategory: data.opiuCategory,
        description: data.description,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const costItemsService = {
    /**
     * Получить все статьи
     */
    async getAll(): Promise<CostItem[]> {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('itemName'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map((doc) => mapDocument(doc.id, doc.data()));
        } catch (error) {
            console.error('Error fetching cost items:', error);
            // Возвращаем seed data если коллекция пуста или ошибка
            return COST_ITEMS_SEED.map((item) => ({
                ...item,
                id: item.itemId,
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
        }
    },

    /**
     * Получить статью по itemId
     */
    async getByItemId(itemId: string): Promise<CostItem | null> {
        try {
            const docRef = doc(db, COLLECTION_NAME, itemId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return null;
            return mapDocument(docSnap.id, docSnap.data());
        } catch (error) {
            console.error(`Error fetching cost item ${itemId}:`, error);
            return null;
        }
    },

    /**
     * Создать новую статью затрат
     */
    async create(data: Omit<CostItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<CostItem> {
        try {
            const now = Timestamp.now();
            const docData = {
                ...data,
                createdAt: now,
                updatedAt: now,
            };

            // Используем itemId как ID документа
            const docRef = doc(db, COLLECTION_NAME, data.itemId);
            await setDoc(docRef, docData);

            return {
                ...data,
                id: data.itemId,
                createdAt: now.toDate(),
                updatedAt: now.toDate(),
            };
        } catch (error) {
            console.error('Error creating cost item:', error);
            throw error;
        }
    },

    /**
     * Обновить статью затрат
     */
    async update(itemId: string, data: Partial<Omit<CostItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
        try {
            const docRef = doc(db, COLLECTION_NAME, itemId);
            await setDoc(docRef, {
                ...data,
                updatedAt: Timestamp.now(),
            }, { merge: true });
        } catch (error) {
            console.error(`Error updating cost item ${itemId}:`, error);
            throw error;
        }
    },

    /**
     * Удалить статью затрат
     */
    async delete(itemId: string): Promise<void> {
        try {
            const docRef = doc(db, COLLECTION_NAME, itemId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error(`Error deleting cost item ${itemId}:`, error);
            throw error;
        }
    },

    /**
     * Загрузить начальные данные в Firestore
     */
    async seedInitialData(): Promise<{ created: number; skipped: number }> {
        let created = 0;
        let skipped = 0;

        for (const item of COST_ITEMS_SEED) {
            try {
                const docRef = doc(db, COLLECTION_NAME, item.itemId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    skipped++;
                    continue;
                }

                const now = Timestamp.now();
                await setDoc(docRef, {
                    ...item,
                    createdAt: now,
                    updatedAt: now,
                });
                created++;
            } catch (error) {
                console.error(`Error seeding ${item.itemId}:`, error);
            }
        }

        return { created, skipped };
    },

    /**
     * Очистить все статьи затрат (для миграции)
     */
    async clearAll(): Promise<number> {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            if (snapshot.empty) return 0;

            const BATCH_SIZE = 500;
            let deleted = 0;

            for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);

                for (const docSnap of chunk) {
                    batch.delete(docSnap.ref);
                }

                await batch.commit();
                deleted += chunk.length;
            }

            return deleted;
        } catch (error) {
            console.error('Error clearing cost items:', error);
            throw error;
        }
    },

    /**
     * Батчевое создание статей затрат (для миграции)
     */
    async batchCreate(
        items: Array<Omit<CostItem, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<{ created: number; errors: string[] }> {
        const errors: string[] = [];
        let created = 0;
        const BATCH_SIZE = 500;

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = items.slice(i, i + BATCH_SIZE);
            const now = Timestamp.now();

            for (const item of chunk) {
                try {
                    const docRef = doc(db, COLLECTION_NAME, item.itemId);
                    batch.set(docRef, {
                        ...item,
                        createdAt: now,
                        updatedAt: now,
                    });
                } catch (error) {
                    errors.push(`CostItem ${item.itemId}: ${error instanceof Error ? error.message : 'Error'}`);
                }
            }

            try {
                await batch.commit();
                created += chunk.length;
            } catch (error) {
                errors.push(`Batch error: ${error instanceof Error ? error.message : 'Error'}`);
            }
        }

        return { created, errors };
    },

    /**
     * Удалить статью затрат по itemId
     */
    async deleteItem(itemId: string): Promise<void> {
        try {
            const docRef = doc(db, COLLECTION_NAME, itemId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error(`Error deleting cost item ${itemId}:`, error);
            throw error;
        }
    },
};
