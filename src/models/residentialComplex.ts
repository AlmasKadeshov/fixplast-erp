export type WorkCategory = 'OVK' | 'NVK' | 'ELECTRIC' | 'FINISHING' | 'OTHER';
export interface ResidentialComplex {
  id: string;
  name: string;
  address?: string;
  status?: string;
}
