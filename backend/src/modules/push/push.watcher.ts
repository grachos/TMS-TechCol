/**
 * Light TMS - Background watcher that turns the nav badge counts into phone
 * push notifications.
 *
 * Reuses the exact same "pendientes" queries that back the badges in
 * AppShell.tsx, but runs on a server-side interval instead of the browser
 * polling — a phone with the app closed still needs to be notified. Fires
 * only on a 0 -> N edge (not on every tick while a count stays > 0), so it
 * doesn't spam a notification every PUSH_WATCH_MS while something is pending.
 */

import { config } from '../../config/env.js';
import { contarDespachosPendientes, contarPendientesCumplido, resumen as resumenCola } from '../cola/cola.repo.js';
import { contarPendientes as contarTercerosPendientes } from '../terceros/tercero.repo.js';
import { contarPendientes as contarVehiculosPendientes } from '../vehiculos/vehiculo.repo.js';
import { enviarATodos } from './push.repo.js';

interface Metrica {
  clave: string;
  contar: () => Promise<number>;
  titulo: string;
  cuerpo: (n: number) => string;
  url: string;
}

const METRICAS: Metrica[] = [
  {
    clave: 'despachos',
    contar: contarDespachosPendientes,
    titulo: 'Despachos pendientes',
    cuerpo: (n) => `${n} remesa${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} de aceptación en el RNDC.`,
    url: '/despachos',
  },
  {
    clave: 'cumplido',
    contar: contarPendientesCumplido,
    titulo: 'Cumplidos pendientes',
    cuerpo: (n) => `${n} manifiesto${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} por cumplir.`,
    url: '/cumplido',
  },
  {
    clave: 'terceros',
    contar: contarTercerosPendientes,
    titulo: 'Terceros pendientes',
    cuerpo: (n) => `${n} tercero${n === 1 ? '' : 's'} sin registrar en el RNDC.`,
    url: '/terceros',
  },
  {
    clave: 'vehiculos',
    contar: contarVehiculosPendientes,
    titulo: 'Vehículos pendientes',
    cuerpo: (n) => `${n} vehículo${n === 1 ? '' : 's'} sin registrar en el RNDC.`,
    url: '/vehiculos',
  },
  {
    clave: 'cola',
    contar: async () => {
      const r = await resumenCola('todos');
      return (r.pendiente ?? 0) + (r.enviando ?? 0) + (r.error ?? 0);
    },
    titulo: 'Cola de envíos',
    cuerpo: (n) => `${n} documento${n === 1 ? '' : 's'} pendiente${n === 1 ? '' : 's'} o con error en la cola RNDC.`,
    url: '/cola',
  },
];

const ultimoConteo = new Map<string, number>();
let intervalo: NodeJS.Timeout | null = null;

async function revisar(): Promise<void> {
  for (const m of METRICAS) {
    let n: number;
    try {
      n = await m.contar();
    } catch {
      continue; // transient DB error — try again next tick
    }
    const anterior = ultimoConteo.get(m.clave);
    ultimoConteo.set(m.clave, n);
    // Skip the very first read per metric (server just started): notifying on
    // a pre-existing backlog every restart would be noise, not a real event.
    if (anterior === undefined) continue;
    if (anterior === 0 && n > 0) {
      await enviarATodos({ title: m.titulo, body: m.cuerpo(n), url: m.url, tag: `tms-${m.clave}` });
    }
  }
}

/** Starts the polling loop. No-op if push isn't configured (missing VAPID keys). */
export function iniciarWatcherPush(): void {
  if (!config().push.habilitado) {
    // eslint-disable-next-line no-console
    console.log('[push] VAPID no configurado — notificaciones push deshabilitadas.');
    return;
  }
  if (intervalo) return;
  const ms = config().push.watchMs;
  intervalo = setInterval(() => {
    void revisar();
  }, ms);
  void revisar();
}
