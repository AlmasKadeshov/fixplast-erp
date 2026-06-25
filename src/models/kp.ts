export interface CommercialProposal {
  id: string;
  token: string;
  supplierId?: string;
  projectId?: string;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
  items: Array<{ name: string; quantity: number; unit: string; price?: number }>;
  createdAt?: Date;
}
