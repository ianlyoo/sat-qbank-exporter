import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendExportHistory,
  filterPreviouslyExportedQuestions,
  loadExportHistory,
} from '../src/core/export-history.mjs';

function createQuestion(questionId) {
  return { questionId };
}

test('export history stores and filters previously exported questions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-'));
  const cachePath = path.join(tempDir, 'export-history.json');
  const config = {
    assessment: 'SAT',
    section: 'Math',
  };

  const initial = await loadExportHistory(cachePath);
  assert.equal(initial.size, 0);

  await appendExportHistory(config, [createQuestion('Q1'), createQuestion('Q2')], cachePath);
  const stored = await loadExportHistory(cachePath);

  assert.equal(stored.size, 2);

  const remaining = filterPreviouslyExportedQuestions(
    config,
    [createQuestion('Q1'), createQuestion('Q3')],
    stored
  );

  assert.deepEqual(
    remaining.map((item) => item.questionId),
    ['Q3']
  );
});

test('strict export history loading fails on invalid cache data', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-invalid-'));
  const cachePath = path.join(tempDir, 'export-history.json');

  await fs.writeFile(cachePath, '{not-valid-json');

  await assert.rejects(
    loadExportHistory(cachePath, { strict: true }),
    /local export-history cache is invalid/
  );
});
