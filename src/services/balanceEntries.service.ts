import {
    collection,
    doc,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    orderBy,
    Timestamp,
    DocumentData,
    onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { BalanceManualEntry, BalanceManualEntryInput } from '../models/balanceEntry';

const COLLECTION_NAME = 'balanceEntries';

function mapDocument(id: string, data: DocumentData): BalanceManualEntry {
    return {
        id,
        section: data.section,
        amount: data.amount ?? 0,
        description: data.description,
        asOfDate: data.asOfDate,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const balanceEntriesService = {
    subscribe(callback: (entries: BalanceManualEntry[]) => void) {
        const q = query(collection(db, COLLECTION_NAME), orderBy('section'));
        return onSnapshot(q, (snap) => {
            callback(snap.docs.map(d => mapDocument(d.id, d.data())));
        }, () => callback([]));
    },

    async getAll(): Promise<BalanceManualEntry[]> {
        const q = query(collection(db, COLLECTION_NAME), orderBy('section'));
        const snap = await getDocs(q);
        return snap.docs.map(d => mapDocument(d.id, d.data()));
    },

    async upsert(id: string | null, data: BalanceManualEntryInput): Promise<string> {
        const now = Timestamp.now();
        if (id) {
            const ref = doc(db, COLLECTION_NAME, id);
            await updateDoc(ref, { ...data, updatedAt: now });
            return id;
        } else {
            const ref = await addDoc(collection(db, COLLECTION_NAME), {
                ...data,
                createdAt: now,
                updatedAt: now,
            });
            return ref.id;
        }
    },

    async delete(id: string): Promise<void> {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    },
};
