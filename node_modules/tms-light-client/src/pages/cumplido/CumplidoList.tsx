/**
 * Light TMS - Dispatches pending cumplido. Ports src/vistas/cumplido_lista.php.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/Alert';

type Row = Record<string, any>;

export default function CumplidoList() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Row[]>('/cumplido'));
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
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <CheckCircle2 size={22} className="text-celeste-600" /> Cumplido de despachos
      </h1>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Manifiesto</th>
              <th className="px-4 py-3">Solicitud</th>
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3">Remesas</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No hay despachos pendientes de cumplido.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((p) => (
                <tr key={p.manifiesto_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{p.num_manifiesto ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{p.consecutivo || `#${p.solicitud_id}`}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{p.placa ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.remesas}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/cumplido/${p.manifiesto_id}`} className="btn-primary px-3 py-1 text-xs">
                      Cumplir
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
