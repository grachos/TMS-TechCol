import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore, type StaffUser } from '../store/auth';
import { api } from '../lib/api';

/** Redirects to /login when there is no active session. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const location = useLocation();

  // Refresh rol/paginas from the server once per mount so an admin changing
  // this user's permissions takes effect without forcing a re-login.
  useEffect(() => {
    if (!token) return;
    void api<{ user: StaffUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {
        // Ignore — api() already logs the user out on a 401.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
