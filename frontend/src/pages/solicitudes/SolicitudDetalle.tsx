/**
 * Light TMS - Solicitud detail. Ports src/vistas/solicitud_detalle.php:
 * shows the solicitud, its manifiesto and remesas, and the actions available by
 * estado (Editar while not despachada; Confirmar despacho while vehicles remain).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Truck, Loader2, FileText, FileSpreadsheet } from 'lucide-react';
import { api, ApiError, openAuthedFile } from '../../lib/api';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/StatusBadge';
import { money, NATURALEZAS, OPERACIONES } from '../../lib/format';

interface Data {
  solicitud: Record<string, any>;
  manifiesto: Record<string, any> | null;
  remesas: Record<string, any>[];
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700">{value ?? '—'}</dd>
    </div>
  );
}

export default function SolicitudDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Data>(`/solicitudes/${id}`));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo cargar.' });
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const s = data.solicitud;
  const despachable = s.estado !== 'despachada' && Number(s.cantidad_vehiculos ?? 1) >= 1;

  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate('/solicitudes')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Solicitudes
      </button>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <FileText size={22} className="text-celeste-600" /> Solicitud {s.consecutivo ?? `#${s.id}`}
          <StatusBadge estado={s.estado} />
        </h1>
        <div className="flex gap-2">
          {s.estado !== 'despachada' && (
            <Link to={`/solicitudes/${id}/editar`} className="btn-ghost">
              <Pencil size={16} /> Editar
            </Link>
          )}
          {despachable && (
            <Link to={`/solicitudes/${id}/despachar`} className="btn-primary">
              <Truck size={16} /> Confirmar despacho
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-celeste-700">Datos generales</h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha" value={s.fecha_solicitud} />
          <Field label="Operación" value={OPERACIONES[s.operacion_transporte] ?? s.operacion_transporte} />
          <Field label="Naturaleza" value={NATURALEZAS[s.naturaleza_carga] ?? s.naturaleza_carga} />
          <Field label="Origen" value={s.municipio_origen} />
          <Field label="Destino" value={s.municipio_destino} />
          <Field label="Producto" value={s.descripcion_producto} />
          <Field label="Valor flete" value={money(s.valor_flete)} />
          <Field label="Retención ICA" value={money(s.retencion_ica)} />
          <Field label="Retención fuente" value={money(s.retencion_fuente)} />
          <Field label="Vehículos" value={`${Math.max(0, Number(s.cantidad_vehiculos_original ?? 0) - Number(s.cantidad_vehiculos ?? 0))}/${s.cantidad_vehiculos_original ?? s.cantidad_vehiculos ?? 1}`} />
        </dl>
      </div>

      {data.manifiesto && (
        <div className="card mt-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-celeste-700">Manifiesto</h2>
            <div className="flex gap-2">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openAuthedFile(`/manifiesto/${data.manifiesto!.id}/pdf`).catch(() => {})}>
                <FileText size={14} /> Manifiesto PDF
              </button>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => openAuthedFile(`/remesa/${data.manifiesto!.id}/pdf`).catch(() => {})}>
                <FileSpreadsheet size={14} /> Remesa PDF
              </button>
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="N° Manifiesto" value={data.manifiesto.num_manifiesto} />
            <Field label="Placa" value={data.manifiesto.placa_vehiculo} />
            <Field label="Estado RNDC" value={<StatusBadge estado={data.manifiesto.estado_rndc} />} />
            <Field label="Ingreso RNDC" value={data.manifiesto.rndc_ingreso_id} />
            <Field label="Flete pactado" value={money(data.manifiesto.valor_flete_pactado)} />
            <Field label="Anticipo" value={money(data.manifiesto.valor_anticipo)} />
          </dl>
        </div>
      )}

      {data.remesas.length > 0 && (
        <div className="card mt-5 overflow-x-auto p-0">
          <h2 className="px-5 pt-4 text-sm font-semibold text-celeste-700">Remesas ({data.remesas.length})</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N° Remesa</th>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Peso</th>
                <th className="px-4 py-2">RNDC</th>
              </tr>
            </thead>
            <tbody>
              {data.remesas.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.num_remesa ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{r.descripcion_producto ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.peso ?? '—'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge estado={r.estado_rndc} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
