import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ProjectDocument } from '../models/projectDocuments';

function mapDoc(id: string, data: DocumentData): ProjectDocument {
  return { id, projectId: data.projectId || '', packageId: data.packageId, name: data.name || '', type: data.type || 'other', status: data.status || 'pending', dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate() : undefined, receivedDate: data.receivedDate instanceof Timestamp ? data.receivedDate.toDate() : undefined, notes: data.notes, fileUrl: data.fileUrl };
}

export const projectDocumentsService = {
  async getByProject(projectId: string): Promise<ProjectDocument[]> {
    const snap = await getDocs(collection(db, 'projectDocuments'));
    return snap.docs.map(d => mapDoc(d.id, d.data())).filter(d => d.projectId === projectId);
  },
  async create(d: Omit<ProjectDocument, 'id'>): Promise<ProjectDocument> {
    const ref = await addDoc(collection(db, 'projectDocuments'), { ...d, createdAt: Timestamp.now() });
    return { ...d, id: ref.id };
  },
  async update(id: string, d: Partial<ProjectDocument>): Promise<void> {
    await updateDoc(doc(db, 'projectDocuments', id), d);
  },
};
