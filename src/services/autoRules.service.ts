import { collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, orderBy, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AutoRule } from '../models/autoRule';

const COLLECTION = 'autoRules';

function mapDoc(id: string, data: DocumentData): AutoRule {
  return {
    id,
    name: data.name || '',
    priority: data.priority ?? 100,
    enabled: data.enabled ?? true,
    descriptionPattern: data.descriptionPattern,
    partnerPattern: data.partnerPattern,
    partnerId: data.partnerId,
    transactionType: data.transactionType,
    minAmount: data.minAmount,
    maxAmount: data.maxAmount,
    setCategoryId: data.setCategoryId,
    setProjectId: data.setProjectId,
    setPartnerId: data.setPartnerId,
    setAutoAup: data.setAutoAup,
    setTagId: data.setTagId,
    matchCount: data.matchCount ?? 0,
    createdBy: data.createdBy || '',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
  };
}

export const autoRulesService = {
  async getAll(): Promise<AutoRule[]> {
    const q = query(collection(db, COLLECTION), orderBy('priority'));
    const snap = await getDocs(q);
    return snap.docs.map(d => mapDoc(d.id, d.data()));
  },

  async getActive(): Promise<AutoRule[]> {
    const all = await this.getAll();
    return all.filter(r => r.enabled);
  },

  async create(rule: Omit<AutoRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutoRule> {
    const now = Timestamp.now();
    const ref = await addDoc(collection(db, COLLECTION), { ...rule, createdAt: now, updatedAt: now });
    return { ...rule, id: ref.id, createdAt: new Date(), updatedAt: new Date() };
  },

  async update(id: string, rule: Partial<AutoRule>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { ...rule, updatedAt: Timestamp.now() });
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },
};
