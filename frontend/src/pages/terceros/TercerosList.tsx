/**
 * Light TMS - Terceros list. Ports src/vistas/terceros.php:
 * search + pagination (10/pg), estado_rndc badge, edit + "registrar en RNDC".
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Send, Loader2, UserRound } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import type { PagedResponse, TerceroListRow, EstadoMaestroRndc } from '../../types';

const ESTADO_STYLE: Record<EstadoMaestroRndc, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  pendiente: 'bg-amber-100 text-amber-700',
  registrado: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
};

export default function TercerosList() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<PagedResponse<TerceroListRow> | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const pagina = Math.max(1, Number.parseInt(params.get('p') ?? '1', 10) || 1);
  const search = params.get('q') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<PagedResponse<TerceroListRow>>('/terceros', { query: { q: search, p: pagina } });
      setData(res);
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar.' });
    } finally {
      setLoading(false);
    }
  }, [search, pagina]);

  useEffect(() => {
    void load();
  }, [load]);

  // Surface ?ok=/?err= flash set by the form redirect, then strip it from the URL.
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

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParams({ q, p: '1' });
  }

  async function registrar(id: number) {
    setSending(id);
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; ingresoId?: string; duplicado?: boolean; mensaje?: string }>(
        `/terceros/${id}/registrar-rndc`,
        { method: 'POST' },
      );
      setFlash({ kind: 'ok', message: r.mensaje ?? `Tercero registrado en RNDC (id ${r.ingresoId}).` });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo registrar.' });
    } finally {
      setSending(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <UserRound size={22} className="text-celeste-600" /> Terceros
        </h1>
        <Link to="/terceros/nuevo" className="btn-primary">
          <Plus size={16} /> Nuevo tercero
        </Link>
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <form onSubmit={submitSearch} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="field-input pl-9"
            placeholder="Buscar por nombre o identificación…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn-ghost" type="submit">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Identificación</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Municipio</th>
              <th className="px-4 py-3">Conductor</th>
              <th className="px-4 py-3">RNDC</th>
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
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Sin terceros.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {t.tipo_id} {t.num_id}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.nombre}</td>
                  <td className="px-4 py-3 text-slate-600">{t.municipio_nombre ?? '—'}</td>
                  <td className="px-4 py-3">
                    {t.es_conductor ? (
                      <span className="rounded-full bg-celeste-100 px-2 py-0.5 text-xs text-celeste-700">Sí</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLE[t.estado_rndc]}`}>
                      {t.estado_rndc}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/terceros/${t.id}/editar`} className="btn-ghost px-2 py-1" title="Editar">
                        <Pencil size={15} />
                      </Link>
                      {isAdmin && t.estado_rndc !== 'registrado' && (
                        <button
                          className="btn-ghost px-2 py-1"
                          title="Registrar en RNDC"
                          disabled={sending === t.id}
                          onClick={() => registrar(t.id)}
                        >
                          {sending === t.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && <Pagination pagina={data.pagina} paginas={data.paginas} onChange={(p) => setParams({ q: search, p: String(p) })} />}
    </div>
  );
}
