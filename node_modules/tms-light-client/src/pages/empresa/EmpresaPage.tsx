/**
 * Light TMS - Datos de la empresa propia. Ports src/vistas/empresa_form.php.
 * Used automatically in remesas/manifiestos (NIT, póliza, EMF, consecutivos).
 * Save is admin-only server-side.
 */

import { useEffect, useState } from 'react';
import { Save, Loader2, Building2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/Alert';
import { useAuthStore } from '../../store/auth';

interface Empresa {
  tipo_id: string;
  nit: string;
  razon_social: string | null;
  nro_poliza: string | null;
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
