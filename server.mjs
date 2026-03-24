import { createAppServer } from './src/server/app.mjs';
import { createRemoteWorkerClient } from './src/server/remote-worker-client.mjs';

const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '4173', 10);
const workerClient = process.env.SAT_WORKER_BASE_URL
  ? createRemoteWorkerClient({ baseUrl: process.env.SAT_WORKER_BASE_URL })
  : undefined;
const server = createAppServer({ workerClient });

server.listen(port, host, () => {
  console.log(`SAT exporter UI running at http://${host}:${port}`);
});
