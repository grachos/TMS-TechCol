/**
 * Light TMS - Confirm dispatch / edit despacho. Ports src/vistas/despacho_form.php:
 * vehicle (autofills conductor+tenedor), payment responsibles, and one-or-more
 * remesas (each with product, terceros and cargue/descargue windows).
 *
 * Two modes, one component:
 *   /solicitudes/:id/despachar        create — seeds the manifiesto + remesas,
 *                                     enqueues them for the RNDC.
 *   /despachos/:manifiestoId/editar   edit — corrects an already-confirmed
 *                                     despacho's fields while it (or a given
 *                                     remesa) hasn't yet been accepted by the
 *                                     RNDC; regenerates the queued XML.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Plus, Trash2, Truck, Lock, Scale } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Autocomplete } from '../../components/Autocomplete';
import { Alert } from '../../components/Alert';
import { NATURALEZAS, UNIDADES, RESPONSABLES } from '../../lib/format';
import type { AcItem } from '../../types';

type Remesa = Record<string, string>;

/** DATE/DATETIME columns come back as "YYYY-MM-DD[ HH:MM:SS]" strings (dateStrings: true). */
const soloFecha = (v: unknown): string => (v ? String(v).slice(0, 10) : '');

/** Builds a remesa's form state, from either the solicitud (new despacho's
 * default remesa) or an existing remesa row (edit mode). */
function remesaDesde(s: Record<string, any> = {}): Remesa {
  return {
    id: s.id != null ? String(s.id) : '',
    estado_rndc: s.estado_rndc ?? '',
    naturaleza_carga: s.naturaleza_carga ?? '1',
    tipo_empaque: s.tipo_empaque ?? '',
    mercancia_codigo: s.mercancia_codigo ?? '',
    descripcion_producto: s.descripcion_producto ?? '',
    unidad_medida: s.unidad_medida ?? '1',
    peso: s.peso != null ? String(s.peso) : '',
    valor_mercancia: s.valor_mercancia != null ? String(s.valor_mercancia) : '',
    remitente_tipo_id: s.remitente_tipo_id ?? '',
    remitente_num_id: s.remitente_num_id ?? '',
    destinatario_tipo_id: s.destinatario_tipo_id ?? '',
    destinatario_num_id: s.destinatario_num_id ?? '',
    generador_tipo_id: s.generador_tipo_id ?? '',
    generador_num_id: s.generador_num_id ?? '',
    fecha_cita_cargue: soloFecha(s.fecha_cita_cargue),
    hora_cita_cargue: s.hora_cita_cargue ?? '',
    horas_pacto_cargue: s.horas_pacto_cargue != null ? String(s.horas_pacto_cargue) : '',
    minutos_pacto_cargue: s.minutos_pacto_cargue != null ? String(s.minutos_pacto_cargue) : '',
    fecha_cita_descargue: soloFecha(s.fecha_cita_descargue),
    hora_cita_descargue: s.hora_cita_descargue ?? '',
    horas_pacto_descargue: s.horas_pacto_descargue != null ? String(s.horas_pacto_descargue) : '',
    minutos_pacto_descargue: s.minutos_pacto_descargue != null ? String(s.minutos_pacto_descargue) : '',
  };
}

export default function DespachoForm() {
  const { id, manifiestoId } = useParams();
  const editar = Boolean(manifiestoId);
  const navigate = useNavigate();
  const [sol, setSol] = useState<Record<string, any> | null>(null);
  const [manifiestoBloqueado, setManifiestoBloqueado] = useState(false);
  const [empaques, setEmpaques] = useState<{ codigo: string; descripcion: string }[]>([]);
  const [placa, setPlaca] = useState('');
  const [conductor, setConductor] = useState({ tipo: '', num: '', label: '(seleccione placa)' });
  const [tenedorLabel, setTenedorLabel] = useState('(seleccione placa)');
  const [respCargue, setRespCargue] = useState('E');
  const [respDescargue, setRespDescargue] = useState('E');
  const [anticipo, setAnticipo] = useState('');
  const [emf, setEmf] = useState('');
  const [remesas, setRemesas] = useState<Remesa[]>([remesaDesde()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ codigo: string; descripcion: string }[]>('/catalogos/empaques').then(setEmpaques).catch(() => setEmpaques([]));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        if (editar) {
          const data = await api<{ solicitud: Record<string, any>; manifiesto: Record<string, any>; remesas: Record<string, any>[] }>(
            `/despachos/${manifiestoId}`,
          );
          const m = data.manifiesto;
          setManifiestoBloqueado(m.estado_rndc === 'aceptado');
          setPlaca(m.placa_vehiculo ?? '');
          setConductor({
            tipo: m.conductor_tipo_id ?? '',
            num: m.conductor_num_id ?? '',
            label: m.conductor_num_id ? `${m.conductor_tipo_id ?? ''} ${m.conductor_num_id}`.trim() : '(no asignado)',
          });
          setTenedorLabel(m.titular_num_id ? `${m.titular_tipo_id ?? ''} ${m.titular_num_id}`.trim() : '(no asignado)');
          if (m.placa_vehiculo) {
            // Replace the tipo/num placeholders with full names, same lookup used when picking a vehículo.
            void api<Record<string, any>>('/vehiculos/detalle', { query: { placa: m.placa_vehiculo } })
              .then((d) => {
                if (d?.conductor_nombre_completo) {
                  setConductor((c) => ({ ...c, label: d.conductor_nombre_completo }));
                }
                if (d?.tenedor_nombre_completo) setTenedorLabel(d.tenedor_nombre_completo);
              })
              .catch(() => {});
          }
          setRespCargue(m.responsable_pago_cargue ?? 'E');
          setRespDescargue(m.responsable_pago_descargue ?? 'E');
          setAnticipo(m.valor_anticipo != null ? String(m.valor_anticipo) : '');
          setEmf(m.emf ?? '');
          setRemesas(data.remesas.length > 0 ? data.remesas.map(remesaDesde) : [remesaDesde()]);
          setSol(data.solicitud);
        } else {
          const { solicitud } = await api<{ solicitud: Record<string, any> }>(`/solicitudes/${id}`);
          setSol(solicitud);
          setEmf(solicitud.emf ?? '');
          setRemesas([remesaDesde(solicitud)]);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el despacho.');
      } finally {
        setLoading(false);
      }
    })();
  }, [editar, id, manifiestoId]);

  async function onPickVehiculo(it: AcItem) {
    const p = String(it.placa ?? '');
    setPlaca(p);
    if (!p) return;
    try {
      const d = await api<Record<string, any>>('/vehiculos/detalle', { query: { placa: p } });
      if (d && d.placa) {
        setConductor({
          tipo: d.conductor_tipo_id ?? '',
          num: d.conductor_num_id ?? '',
          label: d.conductor_nombre_completo || (d.conductor_tipo_id ? `${d.conductor_tipo_id} ${d.conductor_num_id}` : '(no asignado)'),
        });
        setTenedorLabel(d.tenedor_nombre_completo || (d.tenedor_tipo_id ? `${d.tenedor_tipo_id} ${d.tenedor_num_id}` : '(no asignado)'));
      }
    } catch {
      /* ignore */
    }
  }

  function updRemesa(i: number, k: keyof Remesa, v: string) {
    setRemesas((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!placa || !conductor.num) {
      setError('Placa y conductor son obligatorios para despachar.');
      return;
    }
    if (pesoExcedido) {
      setError(
        `El peso de las remesas (${pesoEnFormulario.toLocaleString('es-CO')} kg) supera el peso disponible ` +
          `(${pesoDisponible.toLocaleString('es-CO')} kg) de esta solicitud. Ajusta el peso de las remesas antes de continuar.`,
      );
      return;
    }
    setSaving(true);
    try {
      const body = {
        placa_vehiculo: placa,
        conductor_tipo_id: conductor.tipo,
        conductor_num_id: conductor.num,
        responsable_pago_cargue: respCargue,
        responsable_pago_descargue: respDescargue,
        valor_anticipo: anticipo,
        emf,
        remesas,
      };
      if (editar) {
        const r = await api<{ ok: boolean; mensaje: string }>(`/despachos/${manifiestoId}`, { method: 'PUT', body });
        if (!r.ok) {
          setError(r.mensaje);
          return;
        }
        navigate('/despachos?ok=' + encodeURIComponent(r.mensaje));
      } else {
        await api(`/solicitudes/${id}/despachar`, { method: 'POST', body });
        navigate('/cola?ok=' + encodeURIComponent('Despacho confirmado. Documentos encolados para el RNDC.'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el despacho.');
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

  const volver = () => navigate(editar ? '/despachos' : `/solicitudes/${id}`);

  const pesoTotalSolicitud = Number(sol?.peso ?? 0);
  const pesoDisponible = sol?.peso_disponible != null ? Number(sol.peso_disponible) : pesoTotalSolicitud;
  const pesoEnFormulario = remesas.reduce((acc, r) => acc + (Number(r.peso) || 0), 0);
  const pesoExcedido = pesoTotalSolicitud > 0 && pesoEnFormulario - pesoDisponible > 0.001;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={volver} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> {editar ? 'Despachos' : 'Solicitud'}
      </button>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Truck size={20} className="text-celeste-600" /> {editar ? `Editar despacho · Manifiesto #${manifiestoId}` : `Confirmar despacho · Solicitud #${id}`}
      </h1>
      {editar ? (
        <p className="mb-1 text-sm text-slate-500">
          Corrige los datos de este despacho. Al guardar se regenera el XML pendiente de envío para reflejar los cambios.
        </p>
      ) : (
        <>
          <p className="mb-1 text-sm text-slate-500">
            Al confirmar se completa el manifiesto, se crean las remesas y se encolan (tercero → vehículo → remesas → manifiesto).
          </p>
          <p className="mb-1 text-sm font-medium text-slate-600">Vehículos restantes: {sol?.cantidad_vehiculos ?? 1}</p>
        </>
      )}

      {pesoTotalSolicitud > 0 && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-sm ring-1 ${
            pesoExcedido ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-slate-50 text-slate-600 ring-slate-200'
          }`}
        >
          <Scale size={16} className="shrink-0" />
          <span>
            Peso de la solicitud: <strong>{pesoTotalSolicitud.toLocaleString('es-CO')} kg</strong>
          </span>
          <span>·</span>
          <span>
            Disponible para este despacho: <strong>{pesoDisponible.toLocaleString('es-CO')} kg</strong>
          </span>
          <span>·</span>
          <span>
            En este formulario: <strong>{pesoEnFormulario.toLocaleString('es-CO')} kg</strong>
          </span>
          {pesoExcedido && <strong>— supera el peso disponible, ajusta las remesas antes de guardar.</strong>}
        </div>
      )}

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      {manifiestoBloqueado && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200">
          <Lock size={16} /> Este manifiesto ya fue aceptado por el RNDC; no se puede editar.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset disabled={manifiestoBloqueado} className="space-y-5">
          <fieldset className="card">
            <legend className="px-1 text-sm font-semibold text-celeste-700">Vehículo y conductor</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label">Vehículo (placa)</label>
                <Autocomplete endpoint="/vehiculos/buscar" placeholder="Buscar placa…" initialLabel={placa} onClear={() => setPlaca('')} onSelect={onPickVehiculo} />
              </div>
              <div>
                <label className="field-label">Conductor</label>
                <div className="field-input bg-slate-50 text-slate-600">{conductor.label}</div>
              </div>
              <div>
                <label className="field-label">Tenedor</label>
                <div className="field-input bg-slate-50 text-slate-600">{tenedorLabel}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">El remolque, conductor y tenedor se cargan automáticamente desde el vehículo.</p>
          </fieldset>

          <fieldset className="card">
            <legend className="px-1 text-sm font-semibold text-celeste-700">Responsables y valores del viaje</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Responsable pago cargue</label>
                <select className="field-input" value={respCargue} onChange={(e) => setRespCargue(e.target.value)}>
                  {Object.entries(RESPONSABLES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Responsable pago descargue</label>
                <select className="field-input" value={respDescargue} onChange={(e) => setRespDescargue(e.target.value)}>
                  {Object.entries(RESPONSABLES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Valor del anticipo</label>
                <input type="number" step="0.01" className="field-input" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} />
              </div>
              <div>
                <label className="field-label">NIT EMF (Monitoreo Flota)</label>
                <input className="field-input" maxLength={20} value={emf} onChange={(e) => setEmf(e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset className="card">
            <div className="flex items-center justify-between">
              <legend className="px-1 text-sm font-semibold text-celeste-700">Remesas del despacho</legend>
              {!editar && (
                <button type="button" className="btn-ghost text-xs" onClick={() => setRemesas((rs) => [...rs, remesaDesde()])}>
                  <Plus size={14} /> Agregar remesa
                </button>
              )}
            </div>
            <div className="mt-3 space-y-4">
              {remesas.map((r, i) => {
                const aceptada = r.estado_rndc === 'aceptado';
                return (
                  <fieldset key={r.id || i} disabled={aceptada} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">Remesa {i + 1}</h3>
                      {aceptada ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                          <Lock size={13} /> Aceptada por RNDC — no editable
                        </span>
                      ) : (
                        !editar &&
                        remesas.length > 1 && (
                          <button type="button" className="text-red-500" onClick={() => setRemesas((rs) => rs.filter((_, idx) => idx !== i))}>
                            <Trash2 size={15} />
                          </button>
                        )
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="field-label">Naturaleza</label>
                        <select className="field-input" value={r.naturaleza_carga} onChange={(e) => updRemesa(i, 'naturaleza_carga', e.target.value)}>
                          {Object.entries(NATURALEZAS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Tipo de empaque</label>
                        <select className="field-input" value={r.tipo_empaque} onChange={(e) => updRemesa(i, 'tipo_empaque', e.target.value)}>
                          <option value="">—</option>
                          {empaques.map((emp) => (
                            <option key={emp.codigo} value={emp.codigo}>
                              {emp.codigo} - {emp.descripcion}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="field-label">Producto / mercancía</label>
                        <Autocomplete
                          endpoint="/productos/buscar"
                          placeholder="Buscar producto…"
                          initialLabel={r.mercancia_codigo}
                          onClear={() => updRemesa(i, 'mercancia_codigo', '')}
                          onSelect={(it) => updRemesa(i, 'mercancia_codigo', String(it.codigo ?? ''))}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="field-label">Descripción</label>
                        <input className="field-input" maxLength={250} value={r.descripcion_producto} onChange={(e) => updRemesa(i, 'descripcion_producto', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Unidad</label>
                        <select className="field-input" value={r.unidad_medida} onChange={(e) => updRemesa(i, 'unidad_medida', e.target.value)}>
                          {Object.entries(UNIDADES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Peso (kg)</label>
                        <input type="number" step="0.001" className="field-input" value={r.peso} onChange={(e) => updRemesa(i, 'peso', e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="field-label">Fecha cargue</label>
                        <input type="date" className="field-input" value={r.fecha_cita_cargue} onChange={(e) => updRemesa(i, 'fecha_cita_cargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Hora cargue</label>
                        <input type="time" className="field-input" value={r.hora_cita_cargue} onChange={(e) => updRemesa(i, 'hora_cita_cargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Horas pacto cargue</label>
                        <input type="number" min={0} className="field-input" value={r.horas_pacto_cargue} onChange={(e) => updRemesa(i, 'horas_pacto_cargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Minutos pacto cargue</label>
                        <input type="number" min={0} max={59} className="field-input" value={r.minutos_pacto_cargue} onChange={(e) => updRemesa(i, 'minutos_pacto_cargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Fecha descargue</label>
                        <input type="date" className="field-input" value={r.fecha_cita_descargue} onChange={(e) => updRemesa(i, 'fecha_cita_descargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Hora descargue</label>
                        <input type="time" className="field-input" value={r.hora_cita_descargue} onChange={(e) => updRemesa(i, 'hora_cita_descargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Horas pacto descargue</label>
                        <input type="number" min={0} className="field-input" value={r.horas_pacto_descargue} onChange={(e) => updRemesa(i, 'horas_pacto_descargue', e.target.value)} />
                      </div>
                      <div>
                        <label className="field-label">Minutos pacto descargue</label>
                        <input type="number" min={0} max={59} className="field-input" value={r.minutos_pacto_descargue} onChange={(e) => updRemesa(i, 'minutos_pacto_descargue', e.target.value)} />
                      </div>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </fieldset>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving || manifiestoBloqueado}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {editar ? 'Guardar cambios' : 'Confirmar despacho y encolar'}
          </button>
          <button type="button" className="btn-ghost" onClick={volver}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
