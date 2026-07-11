/**
 * Light TMS - Auth store (Zustand, persisted).
 *
 * Holds the JWT and the current staff user. Persisted to localStorage so a
 * refresh keeps the session. `logout` clears it (also called on any 401).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Rol = 'admin' | 'operador';

/** Assignable page/module keys — mirrors backend auth.repo.ts's PAGINAS. */
export type Pagina =
  | 'solicitudes' | 'despachos' | 'cola' | 'cumplido' | 'informe'
  | 'terceros' | 'vehiculos' | 'productos' | 'empresa';

export interface StaffUser {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  /** Allowed pages for rol='operador'; null = all (backward compatible). Ignored for 'admin'. */
  paginas: Pagina[] | null;
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
  canAccess: (pagina: Pagina) => boolean;
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
      canAccess: (pagina) => {
        const u = get().user;
        if (!u) return false;
        if (u.rol === 'admin') return true;
        return u.paginas === null || u.paginas.includes(pagina);
      },
    }),
    { name: 'tms-auth' },
  ),
);
