import { Construction } from 'lucide-react';

/** Temporary page for modules not yet migrated (Phases 1–7). */
export function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-800">{title}</h1>
      <div className="card flex items-center gap-3 text-slate-500">
        <Construction size={20} className="text-celeste-500" />
        <span>Este módulo se migrará en una fase posterior.</span>
      </div>
    </div>
  );
}
