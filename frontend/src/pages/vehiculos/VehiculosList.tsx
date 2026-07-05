/**
 * Light TMS - Vehículos list. Ports src/vistas/vehiculos.php:
 * plate search + pagination, estado_rndc badge, edit + "registrar en RNDC".
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, Pencil, Send, Loader2, Truck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/StatusBadge';
import type { PagedResponse, VehiculoListRow } from '../../types';

export default function VehiculosList() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<PagedResponse<VehiculoListRow> | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const pagina = Math.max(1, Number.parseInt(params.get('p') ?? '1', 10) || 1);
  const search = params.get('q') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<PagedResponse<VehiculoListRow>>('/vehiculos', { query: { q: search, p: pagina } }));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar.' });
    } finally {
      setLoading(false);
    }
  }, [search, pagina]);

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

  async function registrar(id: number) {
    setSending(id);
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; ingresoId?: string }>(`/vehiculos/${id}/registrar-rndc`, { method: 'POST' });
      setFlash({ kind: 'ok', message: `Vehículo registrado en RNDC (id ${r.ingresoId}).` });
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
          <Truck size={22} className="text-celeste-600" /> Vehículos
        </h1>
        <Link to="/vehiculos/nuevo" className="btn-primary">
          <Plus size={16} /> Nuevo vehículo
        </Link>
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q, p: '1' });
        }}
        className="mb-4 flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="field-input pl-9" placeholder="Buscar por placa…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-ghost" type="submit">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3">Configuración</th>
              <th className="px-4 py-3">Remolque</th>
              <th className="px-4 py-3">Tenedor</th>
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
                  Sin vehículos.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{v.placa}</td>
                  <td className="px-4 py-3 text-slate-600">{v.cod_configuracion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.remolque_placa ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.tenedor_num_id}</td>
                  <td className="px-4 py-3">
                    <StatusBadge estado={v.estado_rndc} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/vehiculos/${v.id}/editar`} className="btn-ghost px-2 py-1" title="Editar">
                        <Pencil size={15} />
                      </Link>
                      {isAdmin && v.estado_rndc !== 'registrado' && (
                        <button
                          className="btn-ghost px-2 py-1"
                          title="Registrar en RNDC"
                          disabled={sending === v.id}
                          onClick={() => registrar(v.id)}
                        >
                          {sending === v.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination pagina={data.pagina} paginas={data.paginas} onChange={(p) => setParams({ q: search, p: String(p) })} />
      )}
    </div>
  );
}
