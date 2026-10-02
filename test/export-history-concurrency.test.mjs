import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendExportHistory,
  clearExportHistory,
  importExportHistory,
  loadExportHistory,
} from '../src/core/export-history.mjs';

const config = { assessment: 'SAT', section: 'Math' };

async function createCache(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-history-concurrency-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, filePath: path.join(directory, 'history.json') };
}

test('concurrent appends and imports preserve every question in one history file', async (t) => {
  const { directory, filePath } = await createCache(t);
  const writes = Array.from({ length: 12 }, (_, index) => {
    const questionId = `Q${index}`;
    return index % 2
      ? importExportHistory({ version: 1, questionKeys: [`SAT::Math::${questionId}`] }, filePath)
      : appendExportHistory(config, [{ questionId }], `${directory}/./history.json`);
  });

  const results = await Promise.allSettled(writes);
  assert.deepEqual(results.map(({ status }) => status), Array(12).fill('fulfilled'));
  assert.deepEqual(
    [...await loadExportHistory(filePath)].sort(),
    Array.from({ length: 12 }, (_, index) => `SAT::Math::Q${index}`).sort()
  );
  assert.deepEqual(await fs.readdir(directory), ['history.json']);
});

test('clear is ordered between pending writes to the same history file', async (t) => {
  const { filePath } = await createCache(t);
  const operations = [
    appendExportHistory(config, [{ questionId: 'before-clear' }], filePath),
    clearExportHistory(filePath),
    appendExportHistory(config, [{ questionId: 'after-clear' }], filePath),
  ];

  const results = await Promise.allSettled(operations);
  assert.deepEqual(results.map(({ status }) => status), Array(3).fill('fulfilled'));
  assert.deepEqual([...await loadExportHistory(filePath)], ['SAT::Math::after-clear']);
});

test('a rejected mutation does not prevent the next queued write', async (t) => {
  const { filePath } = await createCache(t);
  const invalid = appendExportHistory(config, [], filePath);
  const valid = appendExportHistory(config, [{ questionId: 'Q1' }], filePath);

  await assert.rejects(invalid, /invalid/);
  await valid;
  assert.deepEqual([...await loadExportHistory(filePath)], ['SAT::Math::Q1']);
});

test('failed replacement preserves the previous history and removes its temporary file', async (t) => {
  const { directory, filePath } = await createCache(t);
  await appendExportHistory(config, [{ questionId: 'original' }], filePath);
  const failure = new Error('fixture rename failure');
  t.mock.method(fs, 'rename', async () => { throw failure; });

  await assert.rejects(appendExportHistory(config, [{ questionId: 'unsaved' }], filePath), failure);
  assert.deepEqual([...await loadExportHistory(filePath)], ['SAT::Math::original']);
  assert.deepEqual(await fs.readdir(directory), ['history.json']);
});
