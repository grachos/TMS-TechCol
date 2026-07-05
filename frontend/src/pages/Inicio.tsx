/**
 * Light TMS - Dashboard with Recharts KPIs (queue by status, dispatches over
 * time, solicitudes by status) plus DB health.
 */

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { FileText, Truck, Send, AlertTriangle, Database, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface Health {
  ok: boolean;
  database: { ok: boolean };
}
interface Stats {
  solicitudesPorEstado: { estado: string; n: number }[];
  colaPorEstado: { estado: string; n: number }[];
  despachosPorDia: { dia: string; n: number }[];
  totales: { solicitudes?: number; remesas?: number; manifiestos?: number; cola_pendiente?: number; cola_error?: number };
}

const CELESTE = '#236a8f';

function Kpi({ icon: Icon, label, value, tone = 'celeste' }: { icon: typeof FileText; label: string; value: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    celeste: 'text-celeste-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    emerald: 'text-emerald-600',
  };
  return (
    <div className="card">
      <div className={`mb-2 flex items-center gap-2 ${tones[tone]}`}>
        <Icon size={18} /> <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default function Inicio() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Health>('/health', { anonymous: true }).then(setHealth).catch(() => {});
    api<Stats>('/stats')
      .then(setStats)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'));
  }, []);

  const t = stats?.totales ?? {};

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">
        Hola, {user?.nombre?.split(' ')[0] ?? 'usuario'}
      </h1>
      <p className="mb-6 text-sm text-slate-500">Panel de control de despachos.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={FileText} label="Solicitudes" value={t.solicitudes ?? '—'} />
        <Kpi icon={Truck} label="Manifiestos" value={t.manifiestos ?? '—'} />
        <Kpi icon={Send} label="Cola pendiente" value={t.cola_pendiente ?? '—'} tone="amber" />
        <Kpi icon={AlertTriangle} label="Cola con error" value={t.cola_error ?? '—'} tone="red" />
      </div>

      {err && !stats && (
        <div className="card mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Database size={18} /> No se pudieron cargar los indicadores (¿base de datos disponible?).
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Cola de envíos por estado</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats?.colaPorEstado ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="estado" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="n" fill={CELESTE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Despachos (remesas) — últimos 14 días</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats?.despachosPorDia ?? []}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CELESTE} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={CELESTE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dia" fontSize={11} tickFormatter={(d) => String(d).slice(5)} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="n" stroke={CELESTE} fill="url(#g)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Solicitudes por estado</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.solicitudesPorEstado ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="estado" width={90} fontSize={12} />
              <Tooltip />
              <Bar dataKey="n" fill="#4f9fc7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card flex flex-col justify-center">
          <div className="mb-2 flex items-center gap-2 text-celeste-600">
            <Database size={18} /> <span className="text-sm font-medium">Base de datos</span>
          </div>
          <p className="flex items-center gap-2 text-2xl font-semibold text-slate-800">
            {health?.database.ok ? (
              <>
                <ShieldCheck size={22} className="text-emerald-500" /> Conectada
              </>
            ) : (
              <>
                <ShieldAlert size={22} className="text-amber-500" /> No disponible
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
