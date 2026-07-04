import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface AlertProps {
  kind: 'ok' | 'err';
  message: string;
  onClose?: () => void;
}

/** Flash message, mirroring the PHP ?ok=/?err= alerts. */
export function Alert({ kind, message, onClose }: AlertProps) {
  const ok = kind === 'ok';
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${
        ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'
      }`}
    >
      {ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Cerrar">
          <X size={16} />
        </button>
      )}
    </div>
  );
}
