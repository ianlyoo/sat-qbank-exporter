import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { getDefaultExportHistoryPath, resolveManagedPath } from '../src/core/storage.mjs';

test('resolveManagedPath uses SAT_EXPORT_STORAGE_DIR for relative paths', () => {
  process.env.SAT_EXPORT_STORAGE_DIR = '/var/data/sat-qbank';

  assert.equal(resolveManagedPath('./output/math'), path.resolve('/var/data/sat-qbank/output/math'));
  assert.equal(getDefaultExportHistoryPath(), path.resolve('/var/data/sat-qbank/.sat-exporter/export-history.json'));

  delete process.env.SAT_EXPORT_STORAGE_DIR;
  delete process.env.SAT_EXPORT_HISTORY_PATH;
});

test('resolveManagedPath preserves absolute paths and explicit history overrides', () => {
  process.env.SAT_EXPORT_STORAGE_DIR = '/var/data/sat-qbank';
  process.env.SAT_EXPORT_HISTORY_PATH = './history/custom-export-history.json';

  assert.equal(resolveManagedPath('/tmp/sat/output'), path.resolve('/tmp/sat/output'));
  assert.equal(
    getDefaultExportHistoryPath(),
    path.resolve('/var/data/sat-qbank/history/custom-export-history.json')
  );

  delete process.env.SAT_EXPORT_STORAGE_DIR;
  delete process.env.SAT_EXPORT_HISTORY_PATH;
});
