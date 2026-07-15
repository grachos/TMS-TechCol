/**
 * Light TMS - RNDC queue monitor. Ports src/vistas/cola.php:
 * safe-mode banner, estado summary, proceso filter, per-row category badge,
 * XML preview, and "Procesar ahora" (admin).
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Loader2, FileCode, Play, X, Ban, TriangleAlert, XCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { Alert } from '../../components/Alert';
import { StatusBadge } from '../../components/StatusBadge';

type Row = Record<string, any>;

type MotivoAnulacion = 'digitacion' | 'cancelacion';

interface PreviewAnulacionIndividual {
  puedeAnular: boolean;
  motivoBloqueo: string | null;
  tipoAnulacion: string | null;
  label: string | null;
  consecutivo: string | null;
}

/** Tipos de documento que se pueden anular individualmente desde esta fila (no las propias filas anular_*). */
const ANULABLES = new Set(['remesa', 'manifiesto', 'cumplido_remesa', 'cumplido_manifiesto']);

interface ColaResponse {
  filas: Row[];
  resumen: Record<string, number>;
  proceso: string;
  envioHabilitado: boolean;
  ambiente: string;
}

const ETIQUETAS: Record<string, string> = {
  tercero: 'Tercero',
  vehiculo: 'Vehículo',
  remesa: 'Remesa',
  manifiesto: 'Manifiesto',
  cumplido_remesa: 'Cumplido remesa',
  cumplido_manifiesto: 'Cumplido manifiesto',
  anular_cumplido_manifiesto: 'Anular cumplido manifiesto',
  anular_cumplido_remesa: 'Anular cumplido remesa',
  anular_cumplido_inicial_remesa: 'Anular cumplido inicial remesa',
  anular_manifiesto: 'Anular manifiesto',
  anular_remesa: 'Anular remesa',
};
const CATEGORIA: Record<string, string> = {
  tercero: 'Maestro',
  vehiculo: 'Maestro',
  remesa: 'Despacho',
  manifiesto: 'Despacho',
  cumplido_remesa: 'Cumplido',
  cumplido_manifiesto: 'Cumplido',
  anular_cumplido_manifiesto: 'Anulación',
  anular_cumplido_remesa: 'Anulación',
  anular_cumplido_inicial_remesa: 'Anulación',
  anular_manifiesto: 'Anulación',
  anular_remesa: 'Anulación',
};
const CAT_STYLE: Record<string, string> = {
  Maestro: 'bg-blue-100 text-blue-700',
  Despacho: 'bg-emerald-100 text-emerald-700',
  Cumplido: 'bg-orange-100 text-orange-700',
  Anulación: 'bg-red-100 text-red-700',
};
const RESUMEN = ['pendiente', 'enviando', 'enviado', 'error'] as const;

export default function ColaMonitor() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ColaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [xml, setXml] = useState<{ id: number; text: string } | null>(null);
  const [anularRow, setAnularRow] = useState<{ id: number; documento: string } | null>(null);
  const [preview, setPreview] = useState<PreviewAnulacionIndividual | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [motivo, setMotivo] = useState<MotivoAnulacion>('digitacion');
  const [observaciones, setObservaciones] = useState('');
  const [anulando, setAnulando] = useState(false);

  const proceso = params.get('proceso') ?? 'todos';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<ColaResponse>('/cola', { query: { proceso } }));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'Error al cargar la cola.' });
    } finally {
      setLoading(false);
    }
  }, [proceso]);

  useEffect(() => {
    void load();
  }, [load]);

  async function procesarAhora() {
    setProcesando(true);
    setFlash(null);
    try {
      const r = await api<{ mensaje: string }>('/cola/procesar', { method: 'POST' });
      setFlash({ kind: 'ok', message: r.mensaje });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo procesar la cola.' });
    } finally {
      setProcesando(false);
    }
  }

  async function procesarItem(id: number) {
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; mensaje: string }>(`/cola/${id}/procesar`, { method: 'POST' });
      setFlash({ kind: r.ok ? 'ok' : 'err', message: r.mensaje });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo procesar el item.' });
    }
  }

  async function cancelarItem(id: number, tipoDocumento: string) {
    const esLote = ['tercero', 'vehiculo', 'remesa', 'manifiesto'].includes(tipoDocumento);
    const confirmado = window.confirm(
      esLote
        ? 'Esto cancela TODO el despacho pendiente (remesa + manifiesto), no solo esta fila, y lo deja editable de nuevo. ¿Continuar?'
        : '¿Cancelar este envío? No se le reporta nada al RNDC — nunca se envió.',
    );
    if (!confirmado) return;
    setFlash(null);
    try {
      const r = await api<{ ok: boolean; mensaje: string }>(`/cola/${id}/cancelar`, { method: 'POST' });
      setFlash({ kind: r.ok ? 'ok' : 'err', message: r.mensaje });
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo cancelar el item.' });
    }
  }

  async function verXml(id: number) {
    try {
      const text = await api<string>(`/cola/${id}/xml`);
      setXml({ id, text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) });
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo cargar el XML.' });
    }
  }

  async function abrirAnular(id: number, documento: string) {
    setAnularRow({ id, documento });
    setPreview(null);
    setMotivo('digitacion');
    setObservaciones('');
    setPreviewLoading(true);
    try {
      setPreview(await api<PreviewAnulacionIndividual>(`/cola/${id}/anular`));
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo cargar el preview de anulación.' });
      setAnularRow(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmarAnular() {
    if (!anularRow) return;
    setAnulando(true);
    try {
      await api(`/cola/${anularRow.id}/anular`, { method: 'POST', body: { motivo, observaciones } });
      setFlash({ kind: 'ok', message: 'Anulación encolada. Revisa el progreso y el número de aceptación en esta misma lista.' });
      setAnularRow(null);
      await load();
    } catch (e) {
      setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo encolar la anulación.' });
    } finally {
      setAnulando(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
          <Send size={22} className="text-celeste-600" /> Cola de envíos al RNDC
        </h1>
        {isAdmin && (
          <button className="btn-primary" onClick={procesarAhora} disabled={procesando}>
            {procesando ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Procesar ahora
          </button>
        )}
      </div>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">Proceso:</label>
        <select
          className="field-input w-auto"
          value={proceso}
          onChange={(e) => setParams({ proceso: e.target.value })}
        >
          <option value="todos">Despacho + Cumplido</option>
          <option value="despacho">Despacho</option>
          <option value="cumplido">Cumplido</option>
          <option value="anulacion">Anulación</option>
        </select>
        <div className="flex flex-wrap gap-2">
          {RESUMEN.map((est) => (
            <span key={est} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {est}: <strong>{data?.resumen[est] ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">Solicitud</th>
              <th className="px-3 py-3">Categoría</th>
              <th className="px-3 py-3">Documento</th>
              <th className="px-3 py-3">Proc.</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Intentos</th>
              <th className="px-3 py-3">Ingreso RNDC</th>
              <th className="px-3 py-3">Último mensaje</th>
              <th className="px-3 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {!loading && data?.filas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  No hay documentos en la cola. Confirma un despacho o registra un cumplido para encolar.
                </td>
              </tr>
            )}
            {!loading &&
              data?.filas.map((f) => {
                const cat = CATEGORIA[f.tipo_documento] ?? '—';
                return (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3 text-slate-500">{f.id}</td>
                    <td className="px-3 py-3 text-slate-700">{f.consecutivo ?? `#${f.solicitud_id}`}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_STYLE[cat] ?? 'bg-slate-100 text-slate-600'}`}>
                        {cat}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{ETIQUETAS[f.tipo_documento] ?? f.tipo_documento}</td>
                    <td className="px-3 py-3 text-slate-500">{f.proceso_rndc}</td>
                    <td className="px-3 py-3">
                      <StatusBadge estado={f.estado} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">
                      {f.intentos}/{f.max_intentos}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-500">{f.rndc_ingreso_id ?? '—'}</td>
                    <td className="max-w-[16rem] truncate px-3 py-3 text-xs text-slate-400" title={f.ultimo_error ?? ''}>
                      {f.ultimo_error ?? ''}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button className="btn-ghost px-2 py-1" title="Ver XML" onClick={() => verXml(f.id)}>
                          <FileCode size={15} />
                        </button>
                        {isAdmin && ['pendiente', 'error'].includes(f.estado) && (
                          <button className="btn-ghost px-2 py-1" title="Procesar" onClick={() => procesarItem(f.id)}>
                            <Send size={15} />
                          </button>
                        )}
                        {isAdmin && ['pendiente', 'error'].includes(f.estado) && (
                          <button
                            className="btn-ghost px-2 py-1 text-slate-500"
                            title="Cancelar (todavía no se envió al RNDC)"
                            onClick={() => cancelarItem(f.id, f.tipo_documento)}
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        {isAdmin && f.estado === 'enviado' && ANULABLES.has(f.tipo_documento) && f.estado_origen === 'aceptado' && (
                          <button
                            className="btn-ghost px-2 py-1 text-red-600"
                            title="Anular este documento"
                            onClick={() => abrirAnular(f.id, ETIQUETAS[f.tipo_documento] ?? f.tipo_documento)}
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {xml && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setXml(null)}>
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-800">XML · cola #{xml.id}</h3>
              <button onClick={() => setXml(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap p-4 text-xs text-slate-700">{xml.text}</pre>
          </div>
        </div>
      )}

      {anularRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !anulando && setAnularRow(null)}>
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="flex items-center gap-2 font-semibold text-slate-800">
                <Ban size={18} className="text-red-600" /> Anular {anularRow.documento.toLowerCase()}
              </h3>
              <button onClick={() => !anulando && setAnularRow(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-auto p-4">
              {previewLoading && (
                <div className="flex justify-center py-6 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )}

              {!previewLoading && preview && !preview.puedeAnular && (
                <Alert kind="err" message={preview.motivoBloqueo ?? 'No se puede anular este documento.'} />
              )}

              {!previewLoading && preview?.puedeAnular && (
                <>
                  <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                    <p>
                      Esta acción es <strong>irreversible</strong> y se reporta al RNDC: {preview.label} ({preview.consecutivo}
                      ). Solo este documento, sin afectar el resto del despacho.
                    </p>
                  </div>

                  <div className="mb-3">
                    <label className="field-label">Motivo de la anulación</label>
                    <select className="field-input" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAnulacion)}>
                      <option value="digitacion">Error de digitación</option>
                      <option value="cancelacion">Cancelación del servicio</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Observaciones</label>
                    <textarea
                      className="field-input"
                      rows={3}
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Comentario opcional para el RNDC…"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3">
              <button className="btn-ghost" disabled={anulando} onClick={() => setAnularRow(null)}>
                Cancelar
              </button>
              {preview?.puedeAnular && (
                <button className="btn-primary bg-red-600 hover:bg-red-700" disabled={anulando} onClick={confirmarAnular}>
                  {anulando ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                  Confirmar anulación
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
