import { listarInforme } from './src/modules/informe/informe.repo.js';
import { db } from './src/db/pool.js';

console.log('=== REMESA (detalle) ===');
const r = await listarInforme('remesa', {}, 1, 25);
console.log(`total ${r.total}`);
for (const x of r.items) console.log(` rem#${x.id_remesa} conductor="${x.conductor}" tenedor="${x.tenedor}" peso=${x.peso_cargado} flete=${x.valor_flete}`);

console.log('\n=== MANIFIESTO (resumen) ===');
const m = await listarInforme('manifiesto', {}, 1, 25);
console.log(`total ${m.total}`);
for (const x of m.items) console.log(` manif#${x.id_manifiesto} ${x.num_manifiesto} [${x.estado_proceso}] conductor="${x.conductor}" tenedor="${x.tenedor}" remesas=${x.num_remesas} peso_total=${x.peso_total} flete=${x.valor_flete} cliente="${x.cliente}"`);

await db().end();
