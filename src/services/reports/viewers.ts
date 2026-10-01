// Кому открыты отчёты. Документ reportViewers/{email}; читать отчёты могут только они и супер-админы
// (см. firestore.rules). Аккаунт для входа создаётся отдельно — в Firebase Console → Authentication.
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

export interface Viewer { email: string; addedAt: number; addedBy: string }

const COL = 'reportViewers';
const norm = (e: string) => e.trim().toLowerCase();

export async function listViewers(): Promise<Viewer[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map(d => ({ email: d.id, ...(d.data() as Omit<Viewer, 'email'>) })).sort((a, b) => a.email.localeCompare(b.email));
}

export async function addViewer(email: string, addedBy: string): Promise<void> {
  const e = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Некорректная почта');
  await setDoc(doc(db, COL, e), { addedAt: Date.now(), addedBy });
}

export async function removeViewer(email: string): Promise<void> {
  await deleteDoc(doc(db, COL, norm(email)));
}
