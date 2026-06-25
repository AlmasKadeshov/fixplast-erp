export const FOUNDER_EXPENSE_CATEGORIES = [
  { id: 'travel', name: 'Командировка' },
  { id: 'meals', name: 'Питание' },
  { id: 'transport', name: 'Транспорт' },
  { id: 'equipment', name: 'Оборудование' },
  { id: 'other', name: 'Прочее' },
] as const;

export interface FounderExpense {
  id: string;
  founderId: string;
  amount: number;
  description: string;
  categoryId?: string;
  projectId?: string;
  date: Date;
  receiptUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
}
