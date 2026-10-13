import { startStubServer } from './stub-server';

export default async function globalSetup() {
  const server = await startStubServer(4180);
  return async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
}
