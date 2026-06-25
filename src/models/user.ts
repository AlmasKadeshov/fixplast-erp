export interface AppUserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'owner' | 'director' | 'manager' | 'accountant' | 'engineer';
  isActive: boolean;
}
