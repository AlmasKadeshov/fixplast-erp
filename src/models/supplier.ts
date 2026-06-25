export interface Supplier {
  id: string;
  name: string;
  bin?: string;
  phone?: string;
  email?: string;
  rating?: number;
  isActive: boolean;
}
