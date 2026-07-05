/**
 * Light TMS - Cumplido form (procesoid 5 remesa + 6 manifiesto).
 * Ports src/vistas/cumplido_form.php: per-remesa cumplido + descargue windows,
 * and the manifiesto-level cumplido. Saving enqueues both for the RNDC.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/Alert';

type RemesaCumplido = Record<string, string>;

const remesaFields = (r: Record<string, any>): RemesaCumplido => ({
  id: String(r.id),
  num_remesa: r.num_remesa ?? '',
  cumplido_tipo: r.cumplido_tipo ?? 'C',
  peso: r.peso != null ? String(r.peso) : '',
  cantidad_entregada: r.cantidad_entregada != null ? String(r.cantidad_entregada) : r.peso != null ? String(r.peso) : '',
  fecha_llegada_descargue: r.fecha_llegada_descargue ?? '',
  hora_llegada_descargue: r.hora_llegada_descargue ?? '',
  fecha_entrada_descargue: r.fecha_entrada_descargue ?? '',
  hora_entrada_descargue: r.hora_entrada_descargue ?? '',
  fecha_salida_descargue: r.fecha_salida_descargue ?? '',
  hora_salida_descargue: r.hora_salida_descargue ?? '',
  fecha_llegada_cargue: r.fecha_llegada_cargue ?? '',
  hora_llegada_cargue: r.hora_llegada_cargue ?? '',
});

export default function CumplidoForm() {
  const { manifiestoId } = useParams();
  const navigate = useNavigate();
  const [manif, setManif] = useState<Record<string, any> | null>(null);
  const [remesas, setRemesas] = useState<RemesaCumplido[]>([]);
  const [man, setMan] = useState({
    cumplido_tipo: 'C',
    fecha_entrega_documentos: '',
    valor_adicional_flete: '',
    valor_descuento_flete: '',
    observaciones_cumplido: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<{ manifiesto: Record<string, any>; remesas: Record<string, any>[] }>(
          `/cumplido/${manifiestoId}`,
        );
        setManif(data.manifiesto);
        setRemesas(data.remesas.map(remesaFields));
        setMan({
          cumplido_tipo: data.manifiesto.cumplido_tipo ?? 'C',
          fecha_entrega_documentos: data.manifiesto.fecha_entrega_documentos ?? '',
          valor_adicional_flete: data.manifiesto.valor_adicional_flete != null ? String(data.manifiesto.valor_adicional_flete) : '',
          valor_descuento_flete: data.manifiesto.valor_descuento_flete != null ? String(data.manifiesto.valor_descuento_flete) : '',
          observaciones_cumplido: data.manifiesto.observaciones_cumplido ?? '',
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el cumplido.');
      } finally {
        setLoading(false);
      }
    })();
  }, [manifiestoId]);

  function updR(i: number, k: keyof RemesaCumplido, v: string) {
    setRemesas((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/cumplido/${manifiestoId}`, { method: 'POST', body: { ...man, remesas } });
      navigate('/cumplido?ok=' + encodeURIComponent('Cumplido guardado y encolado para el RNDC.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cumplido.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => navigate('/cumplido')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Cumplido
      </button>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <CheckCircle2 size={20} className="text-celeste-600" /> Cumplido · Manifiesto {manif?.num_manifiesto ?? ''}
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        Registra la finalización del viaje. Se encola procesoid 5 (cumplido remesa) y 6 (cumplido manifiesto).
      </p>

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Cumplido de remesas</legend>
          <div className="mt-3 space-y-4">
            {remesas.map((r, i) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Remesa {i + 1}: <span className="font-mono">{r.num_remesa}</span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="field-label">Tipo cumplido</label>
                    <select className="field-input" value={r.cumplido_tipo} onChange={(e) => updR(i, 'cumplido_tipo', e.target.value)}>
                      <option value="C">C — Normal</option>
                      <option value="S">S — Suspendido</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Cantidad cargada (kg)</label>
                    <input type="number" step="0.001" className="field-input" value={r.peso} onChange={(e) => updR(i, 'peso', e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Cantidad entregada (kg)</label>
                    <input type="number" step="0.001" className="field-input" value={r.cantidad_entregada} onChange={(e) => updR(i, 'cantidad_entregada', e.target.value)} />
                  </div>
                </div>
                <p className="mb-2 mt-3 text-xs font-semibold text-celeste-600">Citas de descargue</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    ['fecha_llegada_descargue', 'Fecha llegada', 'date'],
                    ['hora_llegada_descargue', 'Hora llegada', 'time'],
                    ['fecha_entrada_descargue', 'Fecha entrada', 'date'],
                    ['hora_entrada_descargue', 'Hora entrada', 'time'],
                    ['fecha_salida_descargue', 'Fecha salida', 'date'],
                    ['hora_salida_descargue', 'Hora salida', 'time'],
                  ] as const).map(([k, lbl, type]) => (
                    <div key={k}>
                      <label className="field-label">{lbl}</label>
                      <input type={type} className="field-input" value={r[k]} onChange={(e) => updR(i, k, e.target.value)} />
                    </div>
                  ))}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-slate-500">Citas de cargue (si no se capturaron al crear)</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Fecha llegada cargue</label>
                      <input type="date" className="field-input" value={r.fecha_llegada_cargue} onChange={(e) => updR(i, 'fecha_llegada_cargue', e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Hora llegada cargue</label>
                      <input type="time" className="field-input" value={r.hora_llegada_cargue} onChange={(e) => updR(i, 'hora_llegada_cargue', e.target.value)} />
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Cumplido del manifiesto</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Tipo cumplido</label>
              <select className="field-input" value={man.cumplido_tipo} onChange={(e) => setMan((m) => ({ ...m, cumplido_tipo: e.target.value }))}>
                <option value="C">C — Normal</option>
                <option value="S">S — Suspendido</option>
              </select>
            </div>
            <div>
              <label className="field-label">Fecha entrega documentos</label>
              <input type="date" className="field-input" value={man.fecha_entrega_documentos} onChange={(e) => setMan((m) => ({ ...m, fecha_entrega_documentos: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Valor adicional flete</label>
              <input type="number" step="0.01" className="field-input" value={man.valor_adicional_flete} onChange={(e) => setMan((m) => ({ ...m, valor_adicional_flete: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Valor descuento flete</label>
              <input type="number" step="0.01" className="field-input" value={man.valor_descuento_flete} onChange={(e) => setMan((m) => ({ ...m, valor_descuento_flete: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Observaciones</label>
              <textarea className="field-input" rows={3} value={man.observaciones_cumplido} onChange={(e) => setMan((m) => ({ ...m, observaciones_cumplido: e.target.value }))} />
            </div>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cumplido y encolar
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/cumplido')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
