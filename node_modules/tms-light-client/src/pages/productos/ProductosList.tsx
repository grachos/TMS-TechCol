/**
 * Light TMS - Productos (catálogo) list. Ports src/vistas/productos.php:
 * search + pagination, edit codigo_un/estado_producto.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Pencil, Loader2, Package } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Pagination } from '../../components/Pagination';
import { Alert } from '../../components/Alert';
import type { PagedResponse, ProductoListRow } from '../../types';

export const ESTADO_PRODUCTO: Record<string, string> = {
  L: 'Líquido',
  S: 'Sólido/semi-sólido',
  G: 'Gaseoso',
};

export default function ProductosList() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<PagedResponse<ProductoListRow> | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const pagina = Math.max(1, Number.parseInt(params.get('p') ?? '1', 10) || 1);
  const search = params.get('q') ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<PagedResponse<ProductoListRow>>('/productos', { query: { q: search, p: pagina } }));
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
    if (ok) {
      setFlash({ kind: 'ok', message: ok });
      const next = new URLSearchParams(params);
      next.delete('ok');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <Package size={22} className="text-celeste-600" /> Productos
          {data && <span className="text-sm font-normal text-slate-400">{data.total.toLocaleString()} registros</span>}
        </h1>
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
          <input className="field-input pl-9" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-ghost" type="submit">
          Buscar
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">UN</th>
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
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No se encontraron productos.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((p) => (
                <tr key={p.codigo} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.codigo}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{p.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{p.tipo ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.codigo_un ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{ESTADO_PRODUCTO[p.estado_producto ?? ''] ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/productos/${encodeURIComponent(p.codigo)}/editar`} className="btn-ghost px-2 py-1" title="Editar">
                      <Pencil size={15} />
                    </Link>
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
