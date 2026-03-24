import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('vercel config supports workerless static deployments', async () => {
  const configPath = path.resolve('vercel.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.equal(config.framework, null);
  assert.equal(config.installCommand, '');
  assert.equal(config.buildCommand, '');
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.cleanUrls, true);
  assert.ok(!('rewrites' in config));
});
