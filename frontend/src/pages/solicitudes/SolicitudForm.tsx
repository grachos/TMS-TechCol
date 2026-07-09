/**
 * Light TMS - Solicitud de Servicio create/edit. Ports src/vistas/solicitud_form.php:
 * generales, partes/ruta (tercero + municipio autocompletes), carga (product
 * autocomplete + empaque), and valores with the auto-computed retentions.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Autocomplete } from '../../components/Autocomplete';
import { MunicipioAutocomplete } from '../../components/MunicipioAutocomplete';
import { Alert } from '../../components/Alert';
import {
  OPERACIONES,
  NATURALEZAS,
  UNIDADES,
  TIPOS_FLETE,
  TIPOS_PACTADO,
  calcularRetenciones,
} from '../../lib/format';
import type { AcItem, Producto } from '../../types';

/** Message shown/blocked when a dangerous product lacks UN + estado (mirrors the server). */
const PELIGROSA_MSG =
  'El producto es de naturaleza peligrosa pero le falta Código UN y/o Estado del producto. Edítalo en Productos primero.';

const DEFAULTS = {
  consecutivo: '',
  fecha_solicitud: new Date().toISOString().slice(0, 10),
  operacion_transporte: 'G',
  tipo_viaje: 'NACIONAL',
  observaciones: '',
  remitente_tipo_id: '',
  remitente_num_id: '',
  destinatario_tipo_id: '',
  destinatario_num_id: '',
  generador_tipo_id: '',
  generador_num_id: '',
  dueno_poliza: 'N',
  municipio_pago_saldo: '',
  naturaleza_carga: '1',
  tipo_empaque: '',
  mercancia_codigo: '',
  descripcion_producto: '',
  cantidad_vehiculos: '1',
  unidad_medida: '1',
  peso: '',
  valor_mercancia: '',
  valor_flete: '',
  porcentaje_ica: '',
  retencion_ica: '',
  retencion_fuente: '',
  fopat: '',
  tipo_flete: 'G',
  tipo_valor_pactado: 'V',
  fecha_pago_saldo: '',
};

type Form = typeof DEFAULTS;

function Sel({ name, value, onChange, options, withEmpty = true }: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  withEmpty?: boolean;
}) {
  return (
    <select className="field-input" name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {withEmpty && <option value="">—</option>}
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

export default function SolicitudForm() {
  const { id } = useParams();
  const editar = Boolean(id);
  const navigate = useNavigate();
  const [f, setF] = useState<Form>(DEFAULTS);
  const [empaques, setEmpaques] = useState<{ codigo: string; descripcion: string }[]>([]);
  const [labels, setLabels] = useState({ remitente: '', destinatario: '', generador: '', muniPago: '' });
  const [loading, setLoading] = useState(editar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null when Naturaleza = peligrosa and the chosen product lacks UN/estado.
  const [peligrosaAviso, setPeligrosaAviso] = useState<string | null>(null);

  const set = (k: keyof Form, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    void api<{ codigo: string; descripcion: string }[]>('/catalogos/empaques').then(setEmpaques).catch(() => setEmpaques([]));
  }, []);

  useEffect(() => {
    if (!editar) return;
    void (async () => {
      try {
        const { solicitud: s } = await api<{ solicitud: Record<string, any> }>(`/solicitudes/${id}`);
        setF((prev) => {
          const next: Form = { ...prev };
          for (const k of Object.keys(DEFAULTS) as (keyof Form)[]) {
            next[k] = s[k] != null ? String(s[k]) : DEFAULTS[k];
          }
          return next;
        });
        const idl = (t: any, n: any) => (n ? `${t ?? ''} ${n}`.trim() : '');
        setLabels({
          remitente: idl(s.remitente_tipo_id, s.remitente_num_id),
          destinatario: idl(s.destinatario_tipo_id, s.destinatario_num_id),
          generador: idl(s.generador_tipo_id, s.generador_num_id),
          muniPago: s.municipio_pago_saldo ?? '',
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar la solicitud.');
      } finally {
        setLoading(false);
      }
    })();
  }, [editar, id]);

  // Auto-compute retentions (server recomputes authoritatively).
  const ret = useMemo(
    () => calcularRetenciones(Number(f.valor_flete) || 0, Number(f.porcentaje_ica) || 0),
    [f.valor_flete, f.porcentaje_ica],
  );

  // Dangerous-goods guard: when Naturaleza = "Carga peligrosa" (2) and a product
  // is chosen, verify it has Código UN + Estado in the catalog. If not, warn the
  // user immediately and block saving (the server enforces the same rule).
  useEffect(() => {
    const codigo = f.mercancia_codigo.trim();
    if (f.naturaleza_carga !== '2' || codigo === '') {
      setPeligrosaAviso(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api<Producto>(`/productos/${encodeURIComponent(codigo)}`)
        .then((p) => {
          if (cancelled) return;
          setPeligrosaAviso(!p.codigo_un || !p.estado_producto ? PELIGROSA_MSG : null);
        })
        .catch(() => {
          // 404 (not in catalog) or error → no client-side block; the server is the backstop.
          if (!cancelled) setPeligrosaAviso(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [f.naturaleza_carga, f.mercancia_codigo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (peligrosaAviso) {
      setError(peligrosaAviso);
      return;
    }
    setSaving(true);
    try {
      const body = { ...f, ...ret };
      if (editar) await api(`/solicitudes/${id}`, { method: 'PUT', body });
      else {
        const { id: newId } = await api<{ id: number }>('/solicitudes', { method: 'POST', body });
        navigate(`/solicitudes/${newId}?ok=` + encodeURIComponent('Solicitud creada.'));
        return;
      }
      navigate(`/solicitudes/${id}?ok=` + encodeURIComponent('Solicitud actualizada.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la solicitud.');
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
      <button onClick={() => navigate('/solicitudes')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Solicitudes
      </button>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <FileText size={20} className="text-celeste-600" /> {editar ? 'Editar' : 'Nueva'} Solicitud de Servicio
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        Genera el Manifiesto y la Remesa. El vehículo, conductor y cargue/descargue se completan al confirmar el despacho.
      </p>

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* 1. Generales */}
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">1. Generales</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Consecutivo</label>
              <input className="field-input bg-slate-50" readOnly value={f.consecutivo || '(auto)'} />
            </div>
            <div>
              <label className="field-label">Fecha</label>
              <input type="date" className="field-input" value={f.fecha_solicitud} onChange={(e) => set('fecha_solicitud', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Operación de transporte</label>
              <Sel name="operacion_transporte" value={f.operacion_transporte} onChange={(v) => set('operacion_transporte', v)} options={OPERACIONES} withEmpty={false} />
            </div>
            <div>
              <label className="field-label">Tipo de viaje</label>
              <Sel name="tipo_viaje" value={f.tipo_viaje} onChange={(v) => set('tipo_viaje', v)} options={{ NACIONAL: 'Nacional', URBANO: 'Urbano' }} withEmpty={false} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Observaciones</label>
              <textarea className="field-input" rows={2} maxLength={200} value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
            </div>
          </div>
        </fieldset>

        {/* 2. Partes / Ruta */}
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">2. Partes / Ruta</legend>
          <div className="mt-3 space-y-4">
            <TerceroField
              label="Remitente"
              initialLabel={labels.remitente}
              onClear={() => setF((p) => ({ ...p, remitente_tipo_id: '', remitente_num_id: '' }))}
              onSelect={(it) => setF((p) => ({ ...p, remitente_tipo_id: String(it.tipo_id ?? ''), remitente_num_id: String(it.num_id ?? '') }))}
            />
            <TerceroField
              label="Destinatario"
              initialLabel={labels.destinatario}
              onClear={() => setF((p) => ({ ...p, destinatario_tipo_id: '', destinatario_num_id: '' }))}
              onSelect={(it) => setF((p) => ({ ...p, destinatario_tipo_id: String(it.tipo_id ?? ''), destinatario_num_id: String(it.num_id ?? '') }))}
            />
            <TerceroField
              label="Generador de carga"
              initialLabel={labels.generador}
              onClear={() => setF((p) => ({ ...p, generador_tipo_id: '', generador_num_id: '' }))}
              onSelect={(it) => setF((p) => ({ ...p, generador_tipo_id: String(it.tipo_id ?? ''), generador_num_id: String(it.num_id ?? '') }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">¿Dueño póliza?</label>
                <Sel name="dueno_poliza" value={f.dueno_poliza} onChange={(v) => set('dueno_poliza', v)} options={{ N: 'No', S: 'Sí' }} withEmpty={false} />
              </div>
              <div>
                <label className="field-label">Municipio pago del saldo</label>
                <MunicipioAutocomplete
                  initialLabel={labels.muniPago}
                  onClear={() => set('municipio_pago_saldo', '')}
                  onSelect={(codigo) => set('municipio_pago_saldo', codigo)}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">Origen y destino se heredan del municipio del remitente/destinatario.</p>
          </div>
        </fieldset>

        {/* 4. Carga */}
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">3. Carga</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Naturaleza de la carga</label>
              <Sel name="naturaleza_carga" value={f.naturaleza_carga} onChange={(v) => set('naturaleza_carga', v)} options={NATURALEZAS} />
            </div>
            <div>
              <label className="field-label">Tipo de empaque</label>
              <select className="field-input" value={f.tipo_empaque} onChange={(e) => set('tipo_empaque', e.target.value)}>
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
                initialLabel={f.mercancia_codigo}
                onClear={() => set('mercancia_codigo', '')}
                onSelect={(it) => {
                  set('mercancia_codigo', String(it.codigo ?? ''));
                  if (it.nombre && !f.descripcion_producto) set('descripcion_producto', String(it.nombre));
                }}
              />
              {peligrosaAviso && (
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <span>{peligrosaAviso}</span>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Descripción del producto</label>
              <input className="field-input" maxLength={250} value={f.descripcion_producto} onChange={(e) => set('descripcion_producto', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Cantidad vehículos</label>
              <input type="number" step={1} className="field-input" value={f.cantidad_vehiculos} onChange={(e) => set('cantidad_vehiculos', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Unidad de medida</label>
              <Sel name="unidad_medida" value={f.unidad_medida} onChange={(v) => set('unidad_medida', v)} options={UNIDADES} withEmpty={false} />
            </div>
            <div>
              <label className="field-label">Peso (kg)</label>
              <input type="number" step="0.001" className="field-input" value={f.peso} onChange={(e) => set('peso', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Valor de la mercancía</label>
              <input type="number" step="0.01" className="field-input" value={f.valor_mercancia} onChange={(e) => set('valor_mercancia', e.target.value)} />
            </div>
          </div>
        </fieldset>

        {/* 5. Valores */}
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">4. Valores y manifiesto</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Valor del flete</label>
              <input type="number" step="0.01" className="field-input" value={f.valor_flete} onChange={(e) => set('valor_flete', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Tarifa ICA (por mil)</label>
              <input type="number" step="0.01" className="field-input" value={f.porcentaje_ica} onChange={(e) => set('porcentaje_ica', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Retención ICA</label>
              <input className="field-input bg-slate-50" readOnly value={ret.retencion_ica.toFixed(2)} />
            </div>
            <div>
              <label className="field-label">Retención en la fuente (1%)</label>
              <input className="field-input bg-slate-50" readOnly value={ret.retencion_fuente.toFixed(2)} />
            </div>
            <div>
              <label className="field-label">FOPAT (0.1%)</label>
              <input className="field-input bg-slate-50" readOnly value={ret.fopat.toFixed(2)} />
            </div>
            <div>
              <label className="field-label">Tipo de flete</label>
              <Sel name="tipo_flete" value={f.tipo_flete} onChange={(v) => set('tipo_flete', v)} options={TIPOS_FLETE} />
            </div>
            <div>
              <label className="field-label">Tipo de viaje pactado</label>
              <Sel name="tipo_valor_pactado" value={f.tipo_valor_pactado} onChange={(v) => set('tipo_valor_pactado', v)} options={TIPOS_PACTADO} withEmpty={false} />
            </div>
            <div>
              <label className="field-label">Fecha pago del saldo</label>
              <input type="date" className="field-input" value={f.fecha_pago_saldo} onChange={(e) => set('fecha_pago_saldo', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving || !!peligrosaAviso}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {editar ? 'Actualizar' : 'Guardar'} solicitud
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/solicitudes')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function TerceroField({
  label,
  initialLabel,
  onSelect,
  onClear,
}: {
  label: string;
  initialLabel: string;
  onSelect: (it: AcItem) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <Autocomplete
        endpoint="/terceros/buscar"
        placeholder="Nombre, apellido o identificación… (usa % o * como comodín)"
        initialLabel={initialLabel}
        onClear={onClear}
        onSelect={onSelect}
        renderItem={(it) => (
          <div>
            <span className="font-medium">{String(it.nombre ?? it.label)}</span>
            {it.municipio_nombre && <span className="ml-2 text-xs text-slate-400">{String(it.municipio_nombre)}</span>}
          </div>
        )}
      />
    </div>
  );
}
