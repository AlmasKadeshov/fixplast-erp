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
import { Account, AccountInput } from '../models/account';

const COLLECTION_NAME = 'accounts';

function mapDocument(id: string, data: DocumentData): Account {
    return {
        id,
        name: data.name,
        type: data.type,
        currency: data.currency || 'KZT',
        startingBalance: data.startingBalance ?? 0,
        isActive: data.isActive ?? true,
        bankName: data.bankName,
        sortOrder: data.sortOrder ?? 0,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const accountsService = {
    /**
     * Получить все счета (отсортированные по sortOrder)
     */
    async getAll(): Promise<Account[]> {
        const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Получить только активные счета
     */
    async getActive(): Promise<Account[]> {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('isActive', '==', true),
            orderBy('sortOrder')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    /**
     * Получить счёт по ID
     */
    async getById(id: string): Promise<Account | null> {
        const docRef = doc(db, COLLECTION_NAME, id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        return mapDocument(docSnap.id, docSnap.data());
    },

    /**
     * Создать новый счёт
     */
    async create(data: AccountInput): Promise<Account> {
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
     * Обновить счёт
     */
    async update(id: string, data: Partial<AccountInput>): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now(),
        });
    },

    /**
     * Удалить счёт (или деактивировать)
     */
    async delete(id: string): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    /**
     * Архивировать счёт (isActive = false)
     */
    async archive(id: string): Promise<void> {
        await accountsService.update(id, { isActive: false });
    },

    /**
     * Подписка на realtime обновления
     */
    subscribe(callback: (accounts: Account[]) => void): () => void {
        const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder'));
        return onSnapshot(q, (snapshot) => {
            const accounts = snapshot.docs.map((d) => mapDocument(d.id, d.data()));
            callback(accounts);
        });
    },
};
