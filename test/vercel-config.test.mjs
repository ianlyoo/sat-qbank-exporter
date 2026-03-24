import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

test('vercel config proxies /api requests to the configured worker URL', async () => {
  process.env.SAT_WORKER_BASE_URL = 'https://sat-qbank-worker.example.com/';

  const moduleUrl = `${pathToFileURL(path.resolve('vercel.mjs')).href}?test=${Date.now()}`;
  const { config } = await import(moduleUrl);

  assert.equal(config.framework, null);
  assert.equal(config.installCommand, '');
  assert.equal(config.buildCommand, '');
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.cleanUrls, true);
  assert.deepEqual(config.rewrites, [
    {
      source: '/api/:path*',
      destination: 'https://sat-qbank-worker.example.com/api/:path*',
    },
  ]);
});
