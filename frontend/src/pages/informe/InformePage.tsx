/**
 * Light TMS - Informe: filterable report over remesas/manifiestos/solicitudes,
 * downloadable as CSV. Filters: free text, remesa/manifiesto number, process
 * status, client, and despacho date range.
 */

import { useCallback, useEffect, useState } from 'react';
import { FileBarChart2, Download, Search, Loader2, RotateCcw } from 'lucide-react';
import { api, ApiError, downloadAuthedFile } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';

type Row = Record<string, string | number | null>;
interface Column {
  key: string;
  header: string;
}
interface InformeResponse {
  items: Row[];
  total: number;
  pagina: number;
  paginas: number;
  columns: Column[];
}

interface Filtros {
  q: string;
  num_remesa: string;
  num_manifiesto: string;
  estado: string;
  cliente: string;
  desde: string;
  hasta: string;
}

const EMPTY: Filtros = { q: '', num_remesa: '', num_manifiesto: '', estado: '', cliente: '', desde: '', hasta: '' };

// Solo 3 estados de negocio: si está o no radicado en el RNDC ya lo dice la
// columna "RNDC Manifiesto"/"RNDC Remesa" (su ingresoid).
const ESTADO_STYLE: Record<string, string> = {
  despachado: 'bg-blue-100 text-blue-700',
  cumplido: 'bg-emerald-100 text-emerald-700',
  anulado: 'bg-slate-200 text-slate-700',
};

export default function InformePage() {
  const [filtros, setFiltros] = useState<Filtros>(EMPTY);
  const [applied, setApplied] = useState<Filtros>(EMPTY);
  const [nivel, setNivel] = useState<'remesa' | 'manifiesto'>('remesa');
  const [pagina, setPagina] = useState(1);
  const [data, setData] = useState<InformeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const set = <K extends keyof Filtros>(k: K, v: string) => setFiltros((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<InformeResponse>('/informe', { query: { ...applied, nivel, p: pagina } }));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar el informe.' });
    } finally {
      setLoading(false);
    }
  }, [applied, nivel, pagina]);

  function cambiarNivel(n: 'remesa' | 'manifiesto') {
    if (n === nivel) return;
    setNivel(n);
    setPagina(1);
  }

  useEffect(() => {
    void load();
  }, [load]);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    setPagina(1);
    setApplied(filtros);
  }

  function limpiar() {
    setFiltros(EMPTY);
    setApplied(EMPTY);
    setPagina(1);
  }

  async function descargar() {
    setDownloading(true);
    setFlash(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAuthedFile('/informe/csv', `informe_${nivel}_${stamp}.csv`, {
        ...applied,
        nivel,
        stamp: `informe_${nivel}_${stamp}`,
      });
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo descargar el CSV.' });
    } finally {
      setDownloading(false);
    }
  }

  const columns = data?.columns ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <FileBarChart2 size={22} className="text-celeste-600" /> Informe
          {data && <span className="text-sm font-normal text-slate-400">{data.total.toLocaleString()} registros</span>}
        </h1>
        <button className="btn-primary" onClick={descargar} disabled={downloading || (data?.total ?? 0) === 0}>
          {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Descargar CSV
        </button>
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
        <button
          className={`rounded-md px-4 py-1.5 font-medium transition-colors ${nivel === 'remesa' ? 'bg-white text-celeste-700 shadow-sm' : 'text-slate-500'}`}
          onClick={() => cambiarNivel('remesa')}
        >
          Por remesa (detalle)
        </button>
        <button
          className={`rounded-md px-4 py-1.5 font-medium transition-colors ${nivel === 'manifiesto' ? 'bg-white text-celeste-700 shadow-sm' : 'text-slate-500'}`}
          onClick={() => cambiarNivel('manifiesto')}
        >
          Por manifiesto (resumen)
        </button>
      </div>

      <form onSubmit={buscar} className="card mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="field-label">Buscar</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="field-input pl-9" placeholder="Remesa, manifiesto o consecutivo…" value={filtros.q} onChange={(e) => set('q', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">No. Remesa</label>
            <input className="field-input" value={filtros.num_remesa} onChange={(e) => set('num_remesa', e.target.value)} />
          </div>
          <div>
            <label className="field-label">No. Manifiesto</label>
            <input className="field-input" value={filtros.num_manifiesto} onChange={(e) => set('num_manifiesto', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Estado</label>
            <select className="field-input" value={filtros.estado} onChange={(e) => set('estado', e.target.value)}>
              <option value="">Todos</option>
              <option value="despachado">Despachado</option>
              <option value="cumplido">Cumplido</option>
              <option value="anulado">Anulado</option>
            </select>
          </div>
          <div>
            <label className="field-label">Cliente</label>
            <input className="field-input" placeholder="Remitente / destinatario / generador" value={filtros.cliente} onChange={(e) => set('cliente', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Despacho desde</label>
            <input type="date" className="field-input" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Despacho hasta</label>
            <input type="date" className="field-input" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" type="submit">
            <Search size={16} /> Filtrar
          </button>
          <button className="btn-ghost" type="button" onClick={limpiar}>
            <RotateCcw size={16} /> Limpiar
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-3">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={columns.length || 1} className="px-4 py-8 text-center text-slate-400">
                  Sin resultados para los filtros.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((row, i) => (
                <tr key={`${row.id_remesa ?? row.id_manifiesto}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-slate-700">
                      {c.key === 'estado_proceso' ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLE[String(row[c.key])] ?? 'bg-slate-100 text-slate-600'}`}>
                          {String(row[c.key] ?? '')}
                        </span>
                      ) : (
                        (row[c.key] ?? '') as React.ReactNode
                      )}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && <Pagination pagina={data.pagina} paginas={data.paginas} onChange={setPagina} />}
    </div>
  );
}
