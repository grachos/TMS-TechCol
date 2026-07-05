/**
 * Light TMS - Auth store (Zustand, persisted).
 *
 * Holds the JWT and the current staff user. Persisted to localStorage so a
 * refresh keeps the session. `logout` clears it (also called on any 401).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Rol = 'admin' | 'operador';

export interface StaffUser {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  activo: 0 | 1;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: StaffUser | null;
  setSession: (token: string, user: StaffUser) => void;
  setUser: (user: StaffUser) => void;
  logout: () => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
      isAdmin: () => get().user?.rol === 'admin',
    }),
    { name: 'tms-auth' },
  ),
);
