/**
 * Light TMS - Web Push subscriptions + sending.
 *
 * Own VAPID keypair, no third-party notification service: the backend pushes
 * directly to the browser vendor's push endpoint (web-push signs the request).
 */

import webpush from 'web-push';
import type { RowDataPacket } from 'mysql2';
import { db } from '../../db/pool.js';
import { config } from '../../config/env.js';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path the notification opens on click, e.g. "/cola". */
  url?: string;
  /** Collapses repeat notifications for the same badge into one. */
  tag?: string;
}

let vapidConfigured = false;

/** Configures web-push's VAPID details once. No-op (and sends skip) if keys are unset. */
function ensureVapid(): boolean {
  const { habilitado, vapidPublicKey, vapidPrivateKey, vapidSubject } = config().push;
  if (!habilitado) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
  }
  return true;
}

/** Upserts a subscription for a staff user (re-subscribing the same endpoint just refreshes it). */
export async function guardarSuscripcion(
  staffUserId: number,
  sub: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  await db().query(
    `INSERT INTO push_subscriptions (staff_user_id, endpoint, p256dh, auth, user_agent)
     VALUES (:staffUserId, :endpoint, :p256dh, :auth, :userAgent)
     ON DUPLICATE KEY UPDATE staff_user_id = VALUES(staff_user_id), p256dh = VALUES(p256dh),
       auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    { staffUserId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
  );
}

/** Removes a subscription (explicit unsubscribe, or the browser reports it dead). */
export async function eliminarSuscripcion(endpoint: string): Promise<void> {
  await db().query('DELETE FROM push_subscriptions WHERE endpoint = :endpoint', { endpoint });
}

/** Whether the given staff user currently has at least one active subscription. */
export async function tieneSuscripcion(staffUserId: number): Promise<boolean> {
  const [rows] = await db().query<(RowDataPacket & { n: number })[]>(
    'SELECT COUNT(*) AS n FROM push_subscriptions WHERE staff_user_id = :staffUserId',
    { staffUserId },
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Sends a notification to every subscribed device of every active staff user.
 * Prunes subscriptions the push service reports as gone (404/410) so dead
 * endpoints don't keep getting retried on every watcher tick.
 */
export async function enviarATodos(payload: PushPayload): Promise<void> {
  if (!ensureVapid()) return;
  const [rows] = await db().query<RowDataPacket[]>(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
     FROM push_subscriptions ps
     JOIN staff_users su ON su.id = ps.staff_user_id
     WHERE su.activo = 1`,
  );
  const body = JSON.stringify(payload);
  await Promise.all(
    (rows as RowDataPacket[]).map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: String(row.endpoint), keys: { p256dh: String(row.p256dh), auth: String(row.auth) } },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db().query('DELETE FROM push_subscriptions WHERE id = :id', { id: row.id });
        }
        // Other errors (timeouts, transient 5xx) are left for the next watcher tick.
      }
    }),
  );
}
