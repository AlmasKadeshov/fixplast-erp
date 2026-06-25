// Утилита инициализации иерархии проектов в Firestore
import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ProjectSeed {
  id: string;
  name: string;
  parentId?: string | null;
  level: 'group' | 'block' | 'system' | 'contract' | 'project';
  status?: 'active' | 'completed' | 'paused';
}

// Алиас для совместимости с AdminMigration
export async function recreateLaFamiliaHierarchy(): Promise<void> {
  console.warn('recreateLaFamiliaHierarchy: специфично для AmreGroup, пропускается в FixPlast');
}

export async function initProjectHierarchy(projects: ProjectSeed[]): Promise<void> {
  const batch = writeBatch(db);
  for (const p of projects) {
    const ref = doc(collection(db, 'projects'), p.id);
    batch.set(ref, { ...p, createdAt: new Date() });
  }
  await batch.commit();
}
