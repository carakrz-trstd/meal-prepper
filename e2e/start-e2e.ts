import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startServer, type RunningServer } from '../src/server/main';

/**
 * Boots the app for the Playwright run: fresh temp SQLite file, built client, and a tiny control endpoint
 * (`POST /restart` on CONTROL_PORT) so a test can restart the server on the same database file (AC-7).
 */
const port = Number(process.env.PORT ?? 4173);
const controlPort = Number(process.env.CONTROL_PORT ?? port + 2);
const dbFile = path.join(os.tmpdir(), `mealplanner-e2e-${port}-${Date.now()}.db`);

// The client is built once before the run (`npm run test:e2e` = vite build + playwright test); two app
// instances start in parallel, so they must not build into the same folder themselves.
let server: RunningServer = await startServer({ port, dbFile });
console.log(`e2e app on ${server.url} (db ${dbFile})`);

http
  .createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/restart') {
      await server.close();
      server = await startServer({ port, dbFile });
      res.end('restarted');
      return;
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(controlPort, '127.0.0.1');

const shutdown = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
