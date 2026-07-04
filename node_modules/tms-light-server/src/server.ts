/**
 * Light TMS - HTTP server entrypoint.
 */

import { createApp } from './app.js';
import { config } from './config/env.js';

const app = createApp();
const { port, name, env } = config().app;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[${name}] API listening on http://localhost:${port} (env=${env})`);
});
