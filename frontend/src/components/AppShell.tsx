/**
 * Light TMS - Authenticated app shell: top bar + responsive sidebar nav.
 *
 * Mirrors the PHP navigation (src/vista.php): Inicio, Solicitudes, Despachos,
 * Cola, Cumplido, and the Maestros group (Terceros, Vehículos, Productos,
 * Empresa).
 */

import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Truck,
  Send,
  CheckCircle2,
  Users,
  Package,
  Building2,
  FileBarChart2,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import { ChatWidget } from './ChatWidget';

/** How often to re-poll the nav badge counts (ms). */
const BADGE_POLL_MS = 20_000;

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Polls a `{ pendientes }` count endpoint every BADGE_POLL_MS. */
function usePendientes(endpoint: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await api<{ pendientes?: number }>(endpoint);
        if (!cancelled) setCount(r.pendientes ?? 0);
      } catch {
        // Ignore transient failures (e.g. session expiring) — the next poll retries.
      }
    }
    void poll();
    const timer = setInterval(poll, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [endpoint]);
  return count;
}

const NAV: { section?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Inicio', icon: LayoutDashboard },
      { to: '/solicitudes', label: 'Solicitudes', icon: FileText },
      { to: '/despachos', label: 'Despachos', icon: Truck },
      { to: '/cola', label: 'Cola de envíos', icon: Send },
      { to: '/cumplido', label: 'Cumplido', icon: CheckCircle2 },
      { to: '/informe', label: 'Informe', icon: FileBarChart2 },
    ],
  },
  {
    section: 'Maestros',
    items: [
      { to: '/terceros', label: 'Terceros', icon: Users },
      { to: '/vehiculos', label: 'Vehículos', icon: Truck },
      { to: '/productos', label: 'Productos', icon: Package },
      { to: '/empresa', label: 'Empresa', icon: Building2 },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [colaPendientes, setColaPendientes] = useState(0);

  // Poll the queue's pending/error count for the "Cola de envíos" nav badge.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await api<{ pendiente?: number; enviando?: number; error?: number }>('/cola/resumen', {
          query: { proceso: 'todos' },
        });
        if (!cancelled) setColaPendientes((r.pendiente ?? 0) + (r.enviando ?? 0) + (r.error ?? 0));
      } catch {
        // Ignore transient failures (e.g. session expiring) — the next poll retries.
      }
    }
    void poll();
    const timer = setInterval(poll, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Poll pending/not-yet-migrated counts for the other nav badges.
  const despachosPendientes = usePendientes('/despachos/resumen');
  const cumplidoPendientes = usePendientes('/cumplido/resumen');
  const tercerosPendientes = usePendientes('/terceros/resumen');
  const vehiculosPendientes = usePendientes('/vehiculos/resumen');
  const pendientesPorRuta: Record<string, number> = {
    '/despachos': despachosPendientes,
    '/cumplido': cumplidoPendientes,
    '/terceros': tercerosPendientes,
    '/vehiculos': vehiculosPendientes,
  };

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-celeste-800 text-celeste-50 transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Truck size={22} /> Light TMS
          </div>
          <button className="md:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>
        <nav className="mt-2 space-y-6 px-3 pb-6">
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.section && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-celeste-300">
                  {group.section}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive ? 'bg-celeste-600 text-white' : 'text-celeste-100 hover:bg-celeste-700'
                        }`
                      }
                    >
                      <item.icon size={18} />
                      <span className="flex-1">{item.label}</span>
                      {item.to === '/cola' && colaPendientes > 0 && (
                        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                          {colaPendientes > 99 ? '99+' : colaPendientes}
                        </span>
                      )}
                      {(pendientesPorRuta[item.to] ?? 0) > 0 && (
                        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                          {(pendientesPorRuta[item.to] ?? 0) > 99 ? '99+' : pendientesPorRuta[item.to]}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Backdrop (mobile) */}
      {open && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu size={22} />
          </button>
          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">{user?.nombre}</p>
              <p className="text-xs uppercase tracking-wide text-celeste-600">{user?.rol}</p>
            </div>
            <button className="btn-ghost" onClick={doLogout}>
              <LogOut size={16} /> Salir
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>

      <ChatWidget />
    </div>
  );
}
