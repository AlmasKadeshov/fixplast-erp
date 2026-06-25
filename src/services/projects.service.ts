import { collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc, query, orderBy, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';

export type ProjectLevel = 'group' | 'block' | 'system' | 'contract' | 'project';
export type ProjectStatus = 'active' | 'completed' | 'paused' | 'planning';

export interface Project {
  id: string;
  name: string;
  level: ProjectLevel;
  parentId?: string | null;
  status: ProjectStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: number;
  description?: string;
  customerId?: string;
  managerName?: string;
  progress?: number;
  createdAt?: Date;
}

export interface ProjectInput extends Omit<Project, 'id' | 'createdAt'> {}

const COLLECTION = 'projects';

function mapDoc(id: string, data: DocumentData): Project {
  return {
    id,
    name: data.name || '',
    level: data.level || 'project',
    parentId: data.parentId ?? null,
    status: data.status || 'active',
    startDate: data.startDate instanceof Timestamp ? data.startDate.toDate() : null,
    endDate: data.endDate instanceof Timestamp ? data.endDate.toDate() : null,
    budget: data.budget,
    description: data.description,
    customerId: data.customerId,
    managerName: data.managerName,
    progress: data.progress ?? 0,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
  };
}

export const projectsService = {
  async getAll(): Promise<Project[]> {
    const q = query(collection(db, COLLECTION), orderBy('name'));
    const snap = await getDocs(q);
    return snap.docs.map(d => mapDoc(d.id, d.data()));
  },

  async getById(id: string): Promise<Project | null> {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return mapDoc(snap.id, snap.data());
  },

  async create(input: ProjectInput): Promise<Project> {
    const ref = await addDoc(collection(db, COLLECTION), {
      ...input,
      createdAt: Timestamp.now(),
    });
    return { ...input, id: ref.id, createdAt: new Date() };
  },

  async update(id: string, input: Partial<ProjectInput>): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), input);
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },

  async getActive(): Promise<Project[]> {
    const all = await this.getAll();
    return all.filter(p => p.status === 'active');
  },
};
