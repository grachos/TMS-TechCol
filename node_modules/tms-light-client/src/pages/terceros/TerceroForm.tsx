/**
 * Light TMS - Tercero create/edit form. Ports src/vistas/tercero_form.php:
 * general data, municipio autocomplete (DIVIPOLA) + address, lat/long map,
 * and the "is conductor" flag.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { MunicipioAutocomplete } from '../../components/MunicipioAutocomplete';
import { MapPicker } from '../../components/MapPicker';
import { Alert } from '../../components/Alert';
import type { Tercero } from '../../types';

const TIPOS_ID: Record<string, string> = {
  C: 'C - Cédula de ciudadanía',
  N: 'N - NIT',
  E: 'E - Cédula de extranjería',
  T: 'T - Tarjeta de identidad',
  P: 'P - Pasaporte',
};

interface FormState {
  tipo_id: string;
  num_id: string;
  nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  regimen_simple: string;
  cod_municipio: string;
  municipio_nombre: string;
  direccion: string;
  sede: string;
  nombre_sede: string;
  telefono: string;
  celular: string;
  email: string;
  latitud: string;
  longitud: string;
  es_conductor: boolean;
}

const EMPTY: FormState = {
  tipo_id: 'C',
  num_id: '',
  nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  regimen_simple: '',
  cod_municipio: '',
  municipio_nombre: '',
  direccion: '',
  sede: '',
  nombre_sede: '',
  telefono: '',
  celular: '',
  email: '',
  latitud: '',
  longitud: '',
  es_conductor: false,
};

export default function TerceroForm() {
  const { id } = useParams();
  const editar = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(editar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editar) return;
    void (async () => {
      try {
        const t = await api<Tercero>(`/terceros/${id}`);
        setForm({
          tipo_id: t.tipo_id ?? 'C',
          num_id: t.num_id ?? '',
          nombre: t.nombre ?? '',
          primer_apellido: t.primer_apellido ?? '',
          segundo_apellido: t.segundo_apellido ?? '',
          regimen_simple: t.regimen_simple ?? '',
          cod_municipio: t.cod_municipio ?? '',
          municipio_nombre: t.municipio_nombre ?? '',
          direccion: t.direccion ?? '',
          sede: t.sede ?? '',
          nombre_sede: t.nombre_sede ?? '',
          telefono: t.telefono ?? '',
          celular: t.celular ?? '',
          email: t.email ?? '',
          latitud: t.latitud ?? '',
          longitud: t.longitud ?? '',
          es_conductor: t.es_conductor === 1,
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el tercero.');
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
    if (!form.cod_municipio) {
      setError('Elige el municipio de la lista.');
      return;
    }
    setSaving(true);
    try {
      if (editar) {
        await api(`/terceros/${id}`, { method: 'PUT', body: form });
      } else {
        await api('/terceros', { method: 'POST', body: form });
      }
      navigate('/terceros?ok=' + encodeURIComponent(editar ? 'Tercero actualizado.' : 'Tercero guardado.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el tercero.');
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
      <button onClick={() => navigate('/terceros')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Terceros
      </button>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">{editar ? 'Editar' : 'Nuevo'} Tercero</h1>
      <p className="mb-4 text-sm text-slate-500">Remitentes, destinatarios, propietarios, tenedores y conductores.</p>

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      <form onSubmit={onSubmit} className="space-y-5">
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Datos generales</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Tipo de identificación *</label>
              <select className="field-input" value={form.tipo_id} onChange={(e) => upd('tipo_id', e.target.value)}>
                {Object.entries(TIPOS_ID).map(([val, etq]) => (
                  <option key={val} value={val}>
                    {etq}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Número de identificación *</label>
              <input className="field-input" maxLength={15} required value={form.num_id} onChange={(e) => upd('num_id', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Nombre o razón social *</label>
              <input className="field-input" maxLength={100} required value={form.nombre} onChange={(e) => upd('nombre', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Primer apellido</label>
              <input className="field-input" maxLength={100} value={form.primer_apellido} onChange={(e) => upd('primer_apellido', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Segundo apellido</label>
              <input className="field-input" maxLength={100} value={form.segundo_apellido} onChange={(e) => upd('segundo_apellido', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Régimen simple (S/N)</label>
              <input className="field-input" maxLength={1} value={form.regimen_simple} onChange={(e) => upd('regimen_simple', e.target.value.toUpperCase())} />
            </div>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Ubicación</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="field-label">Municipio *</label>
              <MunicipioAutocomplete
                initialLabel={form.municipio_nombre}
                onClear={() => upd('cod_municipio', '')}
                onSelect={(codigo, label) => {
                  upd('cod_municipio', codigo);
                  upd('municipio_nombre', label);
                }}
              />
              {form.cod_municipio && <p className="mt-1 text-xs text-slate-400">Código DIVIPOLA: {form.cod_municipio}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Dirección *</label>
              <input className="field-input" maxLength={120} required value={form.direccion} onChange={(e) => upd('direccion', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Sede</label>
              <input className="field-input" maxLength={6} value={form.sede} onChange={(e) => upd('sede', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Nombre de la sede</label>
              <input className="field-input" maxLength={40} value={form.nombre_sede} onChange={(e) => upd('nombre_sede', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Teléfono</label>
              <input className="field-input" maxLength={10} value={form.telefono} onChange={(e) => upd('telefono', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Celular</label>
              <input className="field-input" maxLength={10} value={form.celular} onChange={(e) => upd('celular', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Correo</label>
              <input className="field-input" type="email" maxLength={120} value={form.email} onChange={(e) => upd('email', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Ubicación geográfica (lat / long)</legend>
          <p className="mb-3 mt-1 text-xs text-slate-500">Haz clic en el mapa o arrastra el marcador para fijar la ubicación.</p>
          <MapPicker
            lat={form.latitud || null}
            lng={form.longitud || null}
            onChange={(la, lo) => setForm((f) => ({ ...f, latitud: la, longitud: lo }))}
          />
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">¿Es conductor?</legend>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.es_conductor} onChange={(e) => upd('es_conductor', e.target.checked)} />
            Sí, este tercero es conductor
          </label>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {editar ? 'Actualizar' : 'Guardar'} tercero
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/terceros')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
