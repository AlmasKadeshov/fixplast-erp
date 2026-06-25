export type DocumentStatus = 'pending' | 'received' | 'approved' | 'rejected';
export type DocumentType = 'contract' | 'act' | 'invoice' | 'permit' | 'other';
export type PackageType = 'smr' | 'supply' | 'design' | 'other';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'Ожидается',
  received: 'Получен',
  approved: 'Утверждён',
  rejected: 'Отклонён',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Договор',
  act: 'Акт',
  invoice: 'Счёт',
  permit: 'Разрешение',
  other: 'Прочее',
};

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  smr: 'СМР',
  supply: 'Поставка',
  design: 'Проектирование',
  other: 'Прочее',
};

export interface ProjectDocument {
  id: string;
  projectId: string;
  packageId?: string;
  name: string;
  type: DocumentType;
  status: DocumentStatus;
  dueDate?: Date;
  receivedDate?: Date;
  notes?: string;
  fileUrl?: string;
}

export interface ProjectDocumentPackage {
  id: string;
  projectId: string;
  type: PackageType;
  name: string;
  documents: ProjectDocument[];
}

export const REQUIRED_DOCUMENTS_BY_PACKAGE: Record<PackageType, DocumentType[]> = {
  smr: ['contract', 'act', 'invoice'],
  supply: ['contract', 'invoice'],
  design: ['contract', 'permit'],
  other: ['other'],
};
