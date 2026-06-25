import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FounderExpense } from '../models/founderExpense';

function mapDoc(id: string, data: DocumentData): FounderExpense {
  return { id, founderId: data.founderId || '', amount: data.amount || 0, description: data.description || '', categoryId: data.categoryId, projectId: data.projectId, date: data.date instanceof Timestamp ? data.date.toDate() : new Date(), receiptUrl: data.receiptUrl, status: data.status || 'pending' };
}

export const founderExpensesService = {
  async getAll(): Promise<FounderExpense[]> {
    const snap = await getDocs(collection(db, 'founderExpenses'));
    return snap.docs.map(d => mapDoc(d.id, d.data()));
  },
  async create(e: Omit<FounderExpense, 'id'>): Promise<FounderExpense> {
    const ref = await addDoc(collection(db, 'founderExpenses'), { ...e, createdAt: Timestamp.now() });
    return { ...e, id: ref.id };
  },
  async update(id: string, e: Partial<FounderExpense>): Promise<void> {
    await updateDoc(doc(db, 'founderExpenses', id), e);
  },
};
