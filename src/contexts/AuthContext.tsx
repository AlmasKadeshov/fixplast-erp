import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

export type UserRole = 'owner' | 'director' | 'manager' | 'accountant' | 'engineer';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Права доступа по ролям
const MODULE_ACCESS: Record<UserRole, string[]> = {
  owner: ['/finance', '/directories', '/projects', '/employees', '/supply', '/import'],
  director: ['/finance', '/directories', '/projects', '/import'],
  accountant: ['/finance', '/directories'],
  manager: ['/finance', '/projects'],
  engineer: ['/projects'],
};

export function hasAccessToModule(role: UserRole, path: string): boolean {
  const allowed = MODULE_ACCESS[role] ?? [];
  return allowed.some(p => path.startsWith(p));
}

// Определение роли по email (временная логика, потом заменить на Firestore)
function getRoleFromEmail(email: string | null): UserRole {
  if (!email) return 'manager';
  if (email.includes('admin') || email.includes('kadeshov') || email.includes('almaskadeshov')) return 'owner';
  if (email.includes('director') || email.includes('suleiman') || email.includes('daniyar')) return 'director';
  if (email.includes('accountant') || email.includes('buh')) return 'accountant';
  return 'manager';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setAppUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Пользователь',
          role: getRoleFromEmail(firebaseUser.email),
        });
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
