import { createWorkerServer } from './src/server/worker-app.mjs';

const host = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '4180', 10);
const server = createWorkerServer();

server.listen(port, host, () => {
  console.log(`SAT exporter worker running at http://${host}:${port}`);
});
