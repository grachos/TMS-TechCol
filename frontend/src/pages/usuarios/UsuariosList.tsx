/**
 * Light TMS - Staff users list. Admin-only (route + backend both gate this):
 * create/edit staff accounts, assign rol and per-page permissions.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Loader2, ShieldCheck, UsersRound } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { Alert } from '../../components/Alert';
import type { StaffUser } from '../../store/auth';

export default function UsuariosList() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<StaffUser[]>('/usuarios'));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (ok || err) {
      setFlash({ kind: ok ? 'ok' : 'err', message: (ok ?? err)! });
      const next = new URLSearchParams(params);
      next.delete('ok');
      next.delete('err');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <UsersRound size={22} className="text-celeste-600" /> Usuarios
        </h1>
        <Link to="/usuarios/nuevo" className="btn-primary">
          <Plus size={16} /> Nuevo usuario
        </Link>
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Páginas</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Sin usuarios.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {u.nombre}
                    {u.id === currentUserId && <span className="ml-2 text-xs text-slate-400">(tú)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.rol === 'admin' ? (
                      <span className="flex items-center gap-1 rounded-full bg-celeste-100 px-2 py-0.5 text-xs font-medium text-celeste-700">
                        <ShieldCheck size={12} /> Admin
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Operador</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.rol === 'admin' ? 'Todas' : (u.paginas === null ? 'Todas' : u.paginas.length === 0 ? 'Ninguna' : `${u.paginas.length} módulo(s)`)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/usuarios/${u.id}/editar`} className="btn-ghost px-2 py-1" title="Editar">
                        <Pencil size={15} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
