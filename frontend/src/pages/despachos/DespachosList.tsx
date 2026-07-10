/**
 * Light TMS - Despachos list. Ports src/vistas/despachos.php:
 * remesas grouped by manifiesto, search + date range + pagination, estado badge,
 * and "procesar despacho" (admin) which drains this manifiesto's queue rows.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Truck, Search, Send, Loader2, FileText, FileSpreadsheet, Pencil, QrCode } from 'lucide-react';
import { api, ApiError, openAuthedFile } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/StatusBadge';
import type { PagedResponse } from '../../types';

type Row = Record<string, any>;

export default function DespachosList() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<PagedResponse<Row> | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [consultandoQr, setConsultandoQr] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const pagina = Math.max(1, Number.parseInt(params.get('p') ?? '1', 10) || 1);
  const search = params.get('q') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<PagedResponse<Row>>('/despachos', { query: { q: search, p: pagina } }));
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

  async function procesar(manifiestoId: number) {
    setSending(manifiestoId);
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; mensaje: string }>(`/despachos/${manifiestoId}/procesar`, { method: 'POST' });
      setFlash({ kind: r.ok ? 'ok' : 'err', message: r.mensaje });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo procesar el despacho.' });
    } finally {
      setSending(null);
    }
  }

  async function consultarQr(manifiestoId: number) {
    setConsultandoQr(manifiestoId);
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; mensaje: string }>(`/despachos/${manifiestoId}/consultar-qr`, { method: 'POST' });
      setFlash({ kind: r.ok ? 'ok' : 'err', message: r.mensaje });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo consultar el código QR.' });
    } finally {
      setConsultandoQr(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Truck size={22} className="text-celeste-600" /> Despachos
      </h1>

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
          <input className="field-input pl-9" placeholder="Buscar remesa o manifiesto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-ghost" type="submit">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3">Consecutivo</th>
              <th className="px-3 py-3">Remesa</th>
              <th className="px-3 py-3">Manifiesto</th>
              <th className="px-3 py-3">Creado</th>
              <th className="px-3 py-3">RNDC</th>
              <th className="px-3 py-3 text-right">Acciones</th>
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
                  Sin despachos.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((d) => (
                <tr key={d.remesa_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3 font-medium text-slate-800">{d.consecutivo ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{d.num_remesa ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{d.num_manifiesto ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-500">{String(d.created_at ?? '').slice(0, 16)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge estado={d.estado_remesa} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {d.manifiesto_id && (
                        <>
                          <button
                            className="btn-ghost px-2 py-1"
                            title="PDF Manifiesto"
                            onClick={() => openAuthedFile(`/manifiesto/${d.manifiesto_id}/pdf`).catch((e) => setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo abrir el PDF.' }))}
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            className="btn-ghost px-2 py-1"
                            title="PDF Remesa"
                            onClick={() => openAuthedFile(`/remesa/${d.manifiesto_id}/pdf`).catch((e) => setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo abrir el PDF.' }))}
                          >
                            <FileSpreadsheet size={15} />
                          </button>
                        </>
                      )}
                      {d.manifiesto_id && d.estado_manifiesto !== 'aceptado' && (
                        <button
                          className="btn-ghost px-2 py-1"
                          title="Editar despacho"
                          onClick={() => navigate(`/despachos/${d.manifiesto_id}/editar`)}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {isAdmin && d.manifiesto_id && (
                        <button
                          className="btn-ghost px-2 py-1"
                          title="Procesar despacho"
                          disabled={sending === d.manifiesto_id}
                          onClick={() => procesar(d.manifiesto_id)}
                        >
                          {sending === d.manifiesto_id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                      )}
                      {isAdmin && d.manifiesto_id && d.estado_manifiesto === 'aceptado' && (
                        <button
                          className={`btn-ghost px-2 py-1 ${d.seguridadqr_error ? 'text-amber-600' : d.seguridadqr ? 'text-emerald-600' : ''}`}
                          title={
                            d.seguridadqr_error
                              ? `Reintentar código QR — último error: ${d.seguridadqr_error}`
                              : d.seguridadqr
                                ? 'Código QR obtenido — click para volver a consultar'
                                : 'Consultar código de seguridad QR'
                          }
                          disabled={consultandoQr === d.manifiesto_id}
                          onClick={() => consultarQr(d.manifiesto_id)}
                        >
                          {consultandoQr === d.manifiesto_id ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
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
