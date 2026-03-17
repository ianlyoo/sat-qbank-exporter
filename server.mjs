import { createAppServer } from './src/server/app.mjs';

const port = Number.parseInt(process.env.PORT || '4173', 10);
const server = createAppServer();

server.listen(port, () => {
  console.log(`SAT exporter UI running at http://localhost:${port}`);
});
