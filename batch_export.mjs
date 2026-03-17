import { runCli } from './src/cli/export-cli.mjs';

runCli().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
