import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Db } from './db/open';
import { buildApp } from './http/app';
import { defaultImportDeps } from './http/imports.routes';

export interface StartOptions {
  port?: number;
  dbFile?: string;
  clientDir?: string;
}

export interface RunningServer {
  app: FastifyInstance;
  db: Db;
  url: string;
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Starts the app on 127.0.0.1 only (local single-user app). */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const dbFile = opts.dbFile ?? process.env.MEALPLANNER_DB ?? './data/meals.db';
  const db = openDatabase(dbFile);
  const app = await buildApp({
    db,
    importDeps: defaultImportDeps(),
    clientDir: opts.clientDir ?? path.resolve(here, '../../dist/client'),
  });
  const port = opts.port ?? (Number(process.env.PORT) || 3000);
  await app.listen({ host: '127.0.0.1', port });
  const address = app.server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  let closed = false;
  return {
    app,
    db,
    url: `http://127.0.0.1:${boundPort}`,
    async close() {
      if (closed) return;
      closed = true;
      await app.close();
      db.close();
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = await startServer();
  console.log(`Meal planner running at ${server.url}`);
  const shutdown = () => void server.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
