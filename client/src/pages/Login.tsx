import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, LogIn, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuthStore, type StaffUser } from '../store/auth';

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await api<{ token: string; user: StaffUser }>('/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { email, password },
      });
      setSession(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-celeste-700 to-celeste-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-white">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            <Truck size={28} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Light TMS</h1>
          <p className="text-sm text-celeste-200">Registro Nacional de Despachos de Carga</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4">
          <div>
            <label className="field-label" htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}
