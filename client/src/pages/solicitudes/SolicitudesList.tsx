/**
 * Light TMS - Solicitudes list. Ports src/vistas/solicitudes.php:
 * search + date range + pagination, despachos counter, estado chip, Ver/Editar.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Eye, Pencil, Loader2, FileText } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/StatusBadge';
import { money } from '../../lib/format';
import type { PagedResponse } from '../../types';

type Row = Record<string, any>;

export default function SolicitudesList() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<PagedResponse<Row> | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [desde, setDesde] = useState(params.get('desde') ?? '');
  const [hasta, setHasta] = useState(params.get('hasta') ?? '');
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const pagina = Math.max(1, Number.parseInt(params.get('p') ?? '1', 10) || 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await api<PagedResponse<Row>>('/solicitudes', {
          query: { q: params.get('q') ?? '', p: pagina, desde: params.get('desde') ?? '', hasta: params.get('hasta') ?? '' },
        }),
      );
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar.' });
    } finally {
      setLoading(false);
    }
  }, [params, pagina]);

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

  function filtrar(e: React.FormEvent) {
    e.preventDefault();
    setParams({ q, desde, hasta, p: '1' });
  }

  const muni = (cod: string | null, nom: string | null) => (nom ? `${cod} - ${nom}` : (cod ?? '—'));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <FileText size={22} className="text-celeste-600" /> Solicitudes de Servicio
          {data && <span className="text-sm font-normal text-slate-400">{data.total.toLocaleString()} registros</span>}
        </h1>
        <Link to="/solicitudes/nueva" className="btn-primary">
          <Plus size={16} /> Nueva solicitud
        </Link>
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <form onSubmit={filtrar} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="field-label">Buscar</label>
          <input className="field-input" placeholder="Consecutivo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Desde</label>
          <input type="date" className="field-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Hasta</label>
          <input type="date" className="field-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button className="btn-ghost" type="submit">
          Filtrar
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3">Consecutivo</th>
              <th className="px-3 py-3">Fecha</th>
              <th className="px-3 py-3">Origen</th>
              <th className="px-3 py-3">Destino</th>
              <th className="px-3 py-3">Flete</th>
              <th className="px-3 py-3">Despachos</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  Aún no hay solicitudes.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((s) => {
                const orig = Number(s.cantidad_vehiculos_original ?? s.cantidad_vehiculos ?? 0);
                const done = Math.max(0, orig - Number(s.cantidad_vehiculos ?? 0));
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium text-slate-800">{s.consecutivo ?? '—'}</td>
                    <td className="px-3 py-3 text-slate-600">{s.fecha_solicitud ?? ''}</td>
                    <td className="px-3 py-3 text-slate-600">{muni(s.municipio_origen, s.origen_nombre)}</td>
                    <td className="px-3 py-3 text-slate-600">{muni(s.municipio_destino, s.destino_nombre)}</td>
                    <td className="px-3 py-3 text-slate-700">{money(s.valor_flete)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">
                      {done}/{orig}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge estado={s.estado} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/solicitudes/${s.id}`} className="btn-ghost px-2 py-1" title="Ver">
                          <Eye size={15} />
                        </Link>
                        {s.estado !== 'despachada' && (
                          <Link to={`/solicitudes/${s.id}/editar`} className="btn-ghost px-2 py-1" title="Editar">
                            <Pencil size={15} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          pagina={data.pagina}
          paginas={data.paginas}
          onChange={(p) => setParams({ q, desde, hasta, p: String(p) })}
        />
      )}
    </div>
  );
}
