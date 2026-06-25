export interface PriceAnalysisItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  supplierId?: string;
}
export interface PriceAnalysisEstimate {
  id: string;
  name: string;
  projectId?: string;
  items: PriceAnalysisItem[];
  createdAt?: Date;
}
