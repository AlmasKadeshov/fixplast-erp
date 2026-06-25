import { collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, orderBy, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';

export type PartnerType = 'CLIENT' | 'SUPPLIER' | 'SUBCONTRACTOR' | 'BANK' | 'OTHER';

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  bin?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isAffiliated?: boolean;
  isActive: boolean;
  createdAt?: Date;
}

export interface PartnerInput extends Omit<Partner, 'id' | 'createdAt'> {}

const COLLECTION = 'partners';

function mapDoc(id: string, data: DocumentData): Partner {
  return {
    id,
    name: data.name || '',
    type: data.type || 'OTHER',
    bin: data.bin,
    phone: data.phone,
    email: data.email,
    notes: data.notes,
    isAffiliated: data.isAffiliated ?? false,
    isActive: data.isActive ?? true,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
  };
}

export const partnersService = {
  async getAll(): Promise<Partner[]> {
    const q = query(collection(db, COLLECTION), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => mapDoc(d.id, d.data()));
  },

  async create(input: PartnerInput): Promise<Partner> {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...input,
      createdAt: Timestamp.now(),
    });
    return { ...input, id: ref.id, createdAt: new Date() };
  },

  async update(id: string, input: Partial<PartnerInput>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), input);
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async getActive(): Promise<Partner[]> {
    const all = await this.getAll();
    return all.filter(p => p.isActive);
  },

  async findByBin(bin: string): Promise<Partner | null> {
    const all = await this.getAll();
    return all.find(p => p.bin === bin) ?? null;
  },

  async batchFindOrCreateByBin(items: Array<{ bin: string; name: string; type?: PartnerType }>): Promise<Record<string, Partner>> {
    const all = await this.getAll();
    const byBin: Record<string, Partner> = {};
    for (const p of all) { if (p.bin) byBin[p.bin] = p; }
    const result: Record<string, Partner> = {};
    for (const item of items) {
      if (byBin[item.bin]) {
        result[item.bin] = byBin[item.bin];
      } else {
        const created = await this.create({ name: item.name, type: item.type ?? 'OTHER', isActive: true });
        result[item.bin] = created;
        if (item.bin) byBin[item.bin] = created;
      }
    }
    return result;
  },
};
