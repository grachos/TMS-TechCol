/**
 * Light TMS - Vehículo create/edit form. Ports src/vistas/vehiculo_form.php:
 * plate, configuration, empty weight, optional remolque, tenedor (required),
 * optional propietario, and optional default conductor.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2, Truck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Autocomplete } from '../../components/Autocomplete';
import { Alert } from '../../components/Alert';
import type { Vehiculo, ConfiguracionVehiculo, AcItem } from '../../types';

interface FormState {
  placa: string;
  cod_configuracion: string;
  marca: string;
  peso_vacio: string;
  remolque_placa: string;
  tenedor_tipo_id: string;
  tenedor_num_id: string;
  propietario_tipo_id: string;
  propietario_num_id: string;
  conductor_tipo_id: string;
  conductor_num_id: string;
  soat_compania: string;
  soat_poliza: string;
  soat_vencimiento: string;
}

const EMPTY: FormState = {
  placa: '',
  cod_configuracion: '',
  marca: '',
  peso_vacio: '',
  remolque_placa: '',
  tenedor_tipo_id: '',
  tenedor_num_id: '',
  propietario_tipo_id: '',
  propietario_num_id: '',
  conductor_tipo_id: '',
  conductor_num_id: '',
  soat_compania: '',
  soat_poliza: '',
  soat_vencimiento: '',
};

const idLabel = (tipo: string | null, num: string | null) => (num ? `${tipo ?? ''} ${num}`.trim() : '');

export default function VehiculoForm() {
  const { id } = useParams();
  const editar = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [configs, setConfigs] = useState<ConfiguracionVehiculo[]>([]);
  const [labels, setLabels] = useState({ tenedor: '', propietario: '', conductor: '' });
  const [loading, setLoading] = useState(editar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<ConfiguracionVehiculo[]>('/catalogos/configuraciones').then(setConfigs).catch(() => setConfigs([]));
  }, []);

  useEffect(() => {
    if (!editar) return;
    void (async () => {
      try {
        const v = await api<Vehiculo>(`/vehiculos/${id}`);
        setForm({
          placa: v.placa ?? '',
          cod_configuracion: v.cod_configuracion ?? '',
          marca: v.marca ?? '',
          peso_vacio: v.peso_vacio != null ? String(v.peso_vacio) : '',
          remolque_placa: v.remolque_placa ?? '',
          tenedor_tipo_id: v.tenedor_tipo_id ?? '',
          tenedor_num_id: v.tenedor_num_id ?? '',
          propietario_tipo_id: v.propietario_tipo_id ?? '',
          propietario_num_id: v.propietario_num_id ?? '',
          conductor_tipo_id: v.conductor_tipo_id ?? '',
          conductor_num_id: v.conductor_num_id ?? '',
          soat_compania: v.soat_compania ?? '',
          soat_poliza: v.soat_poliza ?? '',
          soat_vencimiento: v.soat_vencimiento ?? '',
        });
        setLabels({
          tenedor: idLabel(v.tenedor_tipo_id, v.tenedor_num_id),
          propietario: idLabel(v.propietario_tipo_id, v.propietario_num_id),
          conductor: idLabel(v.conductor_tipo_id, v.conductor_num_id),
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el vehículo.');
      } finally {
        setLoading(false);
      }
    })();
  }, [editar, id]);

  function upd<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.tenedor_num_id) {
      setError('Elige el tenedor de la lista de terceros.');
      return;
    }
    setSaving(true);
    try {
      if (editar) await api(`/vehiculos/${id}`, { method: 'PUT', body: form });
      else await api('/vehiculos', { method: 'POST', body: form });
      navigate('/vehiculos?ok=' + encodeURIComponent(editar ? 'Vehículo actualizado.' : 'Vehículo guardado.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el vehículo.');
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
      <button onClick={() => navigate('/vehiculos')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Vehículos
      </button>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Truck size={20} className="text-celeste-600" /> {editar ? 'Editar' : 'Nuevo'} Vehículo
      </h1>
      <p className="mb-4 text-sm text-slate-500">Marca y propietario los puede heredar el RNDC del RUNT por la placa.</p>

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Datos del vehículo</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Placa *</label>
              <input
                className="field-input uppercase"
                maxLength={6}
                required
                value={form.placa}
                onChange={(e) => upd('placa', e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="field-label">Configuración *</label>
              <select
                className="field-input"
                required
                value={form.cod_configuracion}
                onChange={(e) => upd('cod_configuracion', e.target.value)}
              >
                <option value="">—</option>
                {configs.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.nombre} - {c.descripcion}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Marca</label>
              <input className="field-input" maxLength={40} value={form.marca} onChange={(e) => upd('marca', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Peso vacío (kg) *</label>
              <input
                type="number"
                className="field-input"
                required
                value={form.peso_vacio}
                onChange={(e) => upd('peso_vacio', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Remolque (opcional)</label>
              <Autocomplete
                endpoint="/vehiculos/buscar"
                placeholder="Buscar placa del remolque…"
                initialLabel={form.remolque_placa}
                onClear={() => upd('remolque_placa', '')}
                onSelect={(it: AcItem) => upd('remolque_placa', String(it.placa ?? ''))}
              />
              <p className="mt-1 text-xs text-slate-400">
                El peso vacío del remolque se toma de su propio registro como vehículo.
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">SOAT (solo para impresión del manifiesto)</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label">Compañía de seguros</label>
              <input className="field-input" maxLength={150} value={form.soat_compania} onChange={(e) => upd('soat_compania', e.target.value)} />
            </div>
            <div>
              <label className="field-label">No. Póliza</label>
              <input className="field-input" maxLength={30} value={form.soat_poliza} onChange={(e) => upd('soat_poliza', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Fecha de vencimiento</label>
              <input type="date" className="field-input" value={form.soat_vencimiento} onChange={(e) => upd('soat_vencimiento', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <TerceroPicker
          legend="Tenedor (obligatorio — es un tercero)"
          label="Buscar tercero (tenedor) *"
          initialLabel={labels.tenedor}
          onClear={() => setForm((f) => ({ ...f, tenedor_tipo_id: '', tenedor_num_id: '' }))}
          onSelect={(it) =>
            setForm((f) => ({ ...f, tenedor_tipo_id: String(it.tipo_id ?? ''), tenedor_num_id: String(it.num_id ?? '') }))
          }
        />

        <TerceroPicker
          legend="Propietario (opcional — lo hereda el RNDC)"
          label="Buscar tercero (propietario)"
          initialLabel={labels.propietario}
          onClear={() => setForm((f) => ({ ...f, propietario_tipo_id: '', propietario_num_id: '' }))}
          onSelect={(it) =>
            setForm((f) => ({
              ...f,
              propietario_tipo_id: String(it.tipo_id ?? ''),
              propietario_num_id: String(it.num_id ?? ''),
            }))
          }
        />

        <TerceroPicker
          legend="Conductor por defecto (opcional)"
          label="Buscar tercero (conductor)"
          soloConductor
          initialLabel={labels.conductor}
          onClear={() => setForm((f) => ({ ...f, conductor_tipo_id: '', conductor_num_id: '' }))}
          onSelect={(it) =>
            setForm((f) => ({
              ...f,
              conductor_tipo_id: String(it.tipo_id ?? ''),
              conductor_num_id: String(it.num_id ?? ''),
            }))
          }
        />

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {editar ? 'Actualizar' : 'Guardar'} vehículo
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/vehiculos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/** A fieldset wrapping a terceros autocomplete that yields tipo_id + num_id. */
function TerceroPicker({
  legend,
  label,
  soloConductor,
  initialLabel,
  onSelect,
  onClear,
}: {
  legend: string;
  label: string;
  soloConductor?: boolean;
  initialLabel: string;
  onSelect: (it: AcItem) => void;
  onClear: () => void;
}) {
  return (
    <fieldset className="card">
      <legend className="px-1 text-sm font-semibold text-celeste-700">{legend}</legend>
      <label className="field-label mt-2">{label}</label>
      <Autocomplete
        endpoint="/terceros/buscar"
        params={soloConductor ? { solo_conductor: 1 } : undefined}
        placeholder="Nombre, apellido o identificación… (usa % o * como comodín)"
        initialLabel={initialLabel}
        onClear={onClear}
        onSelect={onSelect}
        renderItem={(it) => (
          <div>
            <span className="font-medium">{String(it.nombre ?? it.label)}</span>
            <span className="ml-2 font-mono text-xs text-slate-400">
              {String(it.tipo_id ?? '')} {String(it.num_id ?? '')}
            </span>
          </div>
        )}
      />
    </fieldset>
  );
}
