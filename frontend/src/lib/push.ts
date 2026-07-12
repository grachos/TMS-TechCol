/**
 * Light TMS - Web Push subscribe/unsubscribe helper.
 *
 * Registers the service worker, asks for Notification permission, subscribes
 * via PushManager (browser hands back an endpoint + keys), and hands that to
 * the backend so it can push directly — no third-party notification service.
 */

import { api } from './api';

export type PushSupport = 'unsupported' | 'ready';

/** Feature-detects what this browser can do, without asking for permission yet. */
export function soportePush(): PushSupport {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return 'ready';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Registers the service worker and waits for it to be active. `register()`
 * alone only guarantees it's installing — pushManager.subscribe() needs an
 * active worker or it throws "no active Service Worker".
 */
async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Current subscription for this browser, if any (does not prompt). */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (soportePush() === 'unsupported') return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** Requests permission (if needed) and subscribes this browser, sending it to the backend. */
export async function activarPush(): Promise<PushSubscription> {
  if (soportePush() === 'unsupported') throw new Error('Este navegador no soporta notificaciones push.');

  const { habilitado, publicKey } = await api<{ habilitado: boolean; publicKey: string | null }>('/push/public-key');
  if (!habilitado || !publicKey) throw new Error('Las notificaciones push no están configuradas en el servidor.');

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Permiso de notificaciones denegado.');

  const reg = await registrarServiceWorker();
  const existente = await reg.pushManager.getSubscription();
  const sub =
    existente ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = sub.toJSON();
  await api('/push/subscribe', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  return sub;
}

/** Unsubscribes this browser and tells the backend to drop it. */
export async function desactivarPush(): Promise<void> {
  const sub = await suscripcionActual();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint } });
}
