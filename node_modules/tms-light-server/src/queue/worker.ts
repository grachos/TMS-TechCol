/**
 * Light TMS - Queue worker. Port of cron/retry_worker.php.
 *
 * Drains the store-and-forward queue once and exits. Schedule via cron/Task
 * Scheduler, e.g. every few minutes:  node dist/queue/worker.js  (or `npm run worker`).
 * Honors COLA_ENVIO_HABILITADO: when false it only builds/previews XML.
 */

import { drenar } from '../modules/cola/cola.repo.js';
import { config } from '../config/env.js';
import { db } from '../db/pool.js';

async function main() {
  const modo = config().cola.envioHabilitado ? 'ENVÍO REAL' : 'modo seguro';
  const r = await drenar();
  // eslint-disable-next-line no-console
  console.log(
    `[worker] Cola drenada (${modo}): enviados=${r.enviados}, errores=${r.errores}, esperando=${r.esperando}, previstos=${r.previstos}.`,
  );
  await db().end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[worker] Falló:', e);
  process.exit(1);
});
