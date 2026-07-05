/**
 * Light TMS - Editar producto. Ports src/vistas/producto_form.php:
 * edits only codigo_un + estado_producto (dangerous-goods fields).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Alert } from '../../components/Alert';
import { ESTADO_PRODUCTO } from './ProductosList';
import type { Producto } from '../../types';

export default function ProductoForm() {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const [prod, setProd] = useState<Producto | null>(null);
  const [codigoUn, setCodigoUn] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = await api<Producto>(`/productos/${encodeURIComponent(codigo!)}`);
        setProd(p);
        setCodigoUn(p.codigo_un ?? '');
        setEstado(p.estado_producto ?? '');
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No se pudo cargar el producto.');
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/productos/${encodeURIComponent(codigo!)}`, {
        method: 'PUT',
        body: { codigo_un: codigoUn, estado_producto: estado },
      });
      navigate('/productos?ok=' + encodeURIComponent('Producto actualizado.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el producto.');
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
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/productos')} className="mb-3 flex items-center gap-1 text-sm text-celeste-700">
        <ArrowLeft size={16} /> Productos
      </button>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Editar producto</h1>
      {prod && (
        <p className="mb-4 text-sm text-slate-500">
          <span className="font-mono">{prod.codigo}</span> — {prod.nombre}
          {prod.peligrosa === 'S' && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Peligrosa</span>}
        </p>
      )}

      {error && <Alert kind="err" message={error} onClose={() => setError(null)} />}

      <form onSubmit={onSubmit}>
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold text-celeste-700">Datos para mercancía peligrosa</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Código UN</label>
              <input className="field-input" maxLength={5} value={codigoUn} onChange={(e) => setCodigoUn(e.target.value)} />
              <p className="mt-1 text-xs text-slate-400">Obligatorio si naturaleza = Carga peligrosa.</p>
            </div>
            <div>
              <label className="field-label">Estado del producto</label>
              <select className="field-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">—</option>
                {Object.entries(ESTADO_PRODUCTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="mt-5 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
          <button type="button" className="btn-ghost" onClick={() => navigate('/productos')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
