export interface PtoItem {
  id: string;
  name: string;
  projectId: string;
  quantity: number;
  unit: string;
  status: 'pending' | 'ordered' | 'delivered';
}
