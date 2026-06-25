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
    Timestamp,
    DocumentData,
    onSnapshot,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Tag, TagInput } from '../models/tag';

const COLLECTION_NAME = 'tags';

function mapDocument(id: string, data: DocumentData): Tag {
    return {
        id,
        name: data.name,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
    };
}

export const tagsService = {
    async getAll(): Promise<Tag[]> {
        const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map((d) => mapDocument(d.id, d.data()));
    },

    async getById(id: string): Promise<Tag | null> {
        const docRef = doc(db, COLLECTION_NAME, id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return null;
        return mapDocument(docSnap.id, docSnap.data());
    },

    async create(data: TagInput): Promise<Tag> {
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

    async update(id: string, data: Partial<TagInput>): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: Timestamp.now(),
        });
    },

    async delete(id: string): Promise<void> {
        const docRef = doc(db, COLLECTION_NAME, id);
        await deleteDoc(docRef);
    },

    subscribe(callback: (tags: Tag[]) => void): () => void {
        const q = query(collection(db, COLLECTION_NAME), orderBy('name'));
        return onSnapshot(q, (snapshot) => {
            const tags = snapshot.docs.map((d) => mapDocument(d.id, d.data()));
            callback(tags);
        });
    },
};
