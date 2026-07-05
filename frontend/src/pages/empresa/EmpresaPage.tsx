/**
 * Light TMS - Datos de la empresa propia. Ports src/vistas/empresa_form.php.
 * Used automatically in remesas/manifiestos (NIT, póliza, EMF, consecutivos).
 * Save is admin-only server-side.
 */

import { useEffect, useState } from 'react';
import { Save, Loader2, Building2, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/Alert';
import { MunicipioAutocomplete } from '../../components/MunicipioAutocomplete';
import { useAuthStore } from '../../store/auth';

interface Empresa {
  tipo_id: string;
  nit: string;
  rndc_username: string | null;
  rndc_password: string | null;
  razon_social: string | null;
  direccion: string | null;
  telefono: string | null;
  cod_municipio: string | null;
  municipio_nombre: string | null;
  nro_poliza: string | null;
  aseguradora_carga_nombre: string | null;
  aseguradora_carga_nit: string | null;
  poliza_carga_numero: string | null;
  poliza_carga_vencimiento: string | null;
  emf: string | null;
  consecutivo_remesa: string;
  consecutivo_manifiesto: string;
}

export default function EmpresaPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [form, setForm] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setForm(await api<Empresa>('/empresa'));
      } catch (e) {
        setFlash({ kind: 'err', message: e instanceof ApiError ? e.message : 'No se pudo cargar.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function upd<K extends keyof Empresa>(key: K, value: Empresa[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFlash(null);
    try {
      await api('/empresa', { method: 'PUT', body: form });
      setFlash({ kind: 'ok', message: 'Datos de la empresa guardados.' });
    } catch (err) {
      setFlash({ kind: 'err', message: err instanceof ApiError ? err.message : 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-800">
        <Building2 size={20} className="text-celeste-600" /> Datos de la empresa
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        Se usan automáticamente en las remesas y manifiestos (NIT de la empresa transportadora, póliza y consecutivos).
      </p>

      {flash && <Alert kind={flash.kind} message={flash.message} onClose={() => setFlash(null)} />}
      {!isAdmin && (
        <Alert kind="err" message="Solo un administrador puede modificar estos datos." />
      )}

      <form onSubmit={onSubmit}>
        <fieldset className="card" disabled={!isAdmin}>
          <legend className="px-1 text-sm font-semibold text-celeste-700">Empresa transportadora</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Tipo identificación</label>
              <select className="field-input" value={form.tipo_id} onChange={(e) => upd('tipo_id', e.target.value)}>
                <option value="N">N - NIT</option>
                <option value="C">C - Cédula</option>
              </select>
            </div>
            <div>
              <label className="field-label">NIT *</label>
              <input className="field-input" maxLength={20} required value={form.nit} onChange={(e) => upd('nit', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Razón social</label>
              <input className="field-input" maxLength={150} value={form.razon_social ?? ''} onChange={(e) => upd('razon_social', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Dirección</label>
              <input className="field-input" maxLength={150} value={form.direccion ?? ''} onChange={(e) => upd('direccion', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Teléfono</label>
              <input className="field-input" maxLength={20} value={form.telefono ?? ''} onChange={(e) => upd('telefono', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Municipio</label>
              <MunicipioAutocomplete
                initialLabel={form.municipio_nombre ?? ''}
                onClear={() => upd('cod_municipio', '')}
                onSelect={(codigo, label) => {
                  upd('cod_municipio', codigo);
                  upd('municipio_nombre', label);
                }}
              />
            </div>
            <div>
              <label className="field-label">Nro. póliza</label>
              <input className="field-input" maxLength={20} value={form.nro_poliza ?? ''} onChange={(e) => upd('nro_poliza', e.target.value)} />
            </div>
            <div>
              <label className="field-label">NIT EMF (Empresa Monitoreo Flota)</label>
              <input className="field-input" maxLength={20} value={form.emf ?? ''} onChange={(e) => upd('emf', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Últ. consecutivo remesa</label>
              <input className="field-input font-mono" value={form.consecutivo_remesa} onChange={(e) => upd('consecutivo_remesa', e.target.value)} />
            </div>
            <div>
              <label className="field-label">Últ. consecutivo manifiesto</label>
              <input className="field-input font-mono" value={form.consecutivo_manifiesto} onChange={(e) => upd('consecutivo_manifiesto', e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="card mt-5" disabled={!isAdmin}>
          <legend className="px-1 text-sm font-semibold text-celeste-700">Credenciales RNDC</legend>
          <p className="mt-1 text-xs text-slate-500">
            El NIT enviado al RNDC (NUMNITEMPRESATRANSPORTE) es el campo "NIT *" de arriba.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Usuario RNDC</label>
              <input
                className="field-input"
                maxLength={60}
                autoComplete="off"
                value={form.rndc_username ?? ''}
                onChange={(e) => upd('rndc_username', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Contraseña RNDC</label>
              <div className="relative">
                <input
                  className="field-input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  maxLength={120}
                  autoComplete="off"
                  value={form.rndc_password ?? ''}
                  onChange={(e) => upd('rndc_password', e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="card mt-5" disabled={!isAdmin}>
          <legend className="px-1 text-sm font-semibold text-celeste-700">
            Aseguradora de mercancía peligrosa (tabla "Tomador Póliza" de la Remesa)
          </legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Nombre aseguradora</label>
              <input
                className="field-input"
                maxLength={150}
                value={form.aseguradora_carga_nombre ?? ''}
                onChange={(e) => upd('aseguradora_carga_nombre', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">NIT aseguradora</label>
              <input
                className="field-input"
                maxLength={20}
                value={form.aseguradora_carga_nit ?? ''}
                onChange={(e) => upd('aseguradora_carga_nit', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">No. Póliza mercancía peligrosa</label>
              <input
                className="field-input"
                maxLength={30}
                value={form.poliza_carga_numero ?? ''}
                onChange={(e) => upd('poliza_carga_numero', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Fecha de vencimiento</label>
              <input
                type="date"
                className="field-input"
                value={form.poliza_carga_vencimiento ?? ''}
                onChange={(e) => upd('poliza_carga_vencimiento', e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        {isAdmin && (
          <div className="mt-5">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
