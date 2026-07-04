import type { EstadoMaestroRndc } from '../types';

const STYLE: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  pendiente: 'bg-amber-100 text-amber-700',
  registrado: 'bg-emerald-100 text-emerald-700',
  enviado: 'bg-blue-100 text-blue-700',
  aceptado: 'bg-emerald-100 text-emerald-700',
  rechazado: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
};

/** Colored pill for RNDC states (maestros + documents). */
export function StatusBadge({ estado }: { estado: EstadoMaestroRndc | string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[estado] ?? 'bg-slate-100 text-slate-600'}`}>
      {estado}
    </span>
  );
}
