import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  pagina: number;
  paginas: number;
  onChange: (p: number) => void;
}

/** Compact pager mirroring the 10-per-page PHP list views. */
export function Pagination({ pagina, paginas, onChange }: PaginationProps) {
  if (paginas <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-1">
      <button
        className="btn-ghost px-2 py-1"
        disabled={pagina <= 1}
        onClick={() => onChange(pagina - 1)}
        aria-label="Anterior"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="px-3 text-sm text-slate-600">
        Página {pagina} de {paginas}
      </span>
      <button
        className="btn-ghost px-2 py-1"
        disabled={pagina >= paginas}
        onClick={() => onChange(pagina + 1)}
        aria-label="Siguiente"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
