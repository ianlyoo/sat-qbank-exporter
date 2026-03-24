import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendExportHistory,
  clearExportHistory,
  filterPreviouslyExportedQuestions,
  importExportHistory,
  loadExportHistory,
  readExportHistorySnapshot,
  serializeExportHistorySnapshot,
} from '../src/core/export-history.mjs';

function createQuestion(questionId, overrides = {}) {
  return {
    questionId,
    primary_class_cd_desc: 'Algebra',
    skill_desc: 'Linear functions',
    difficulty: 'E',
    ...overrides,
  };
}

test('export history stores batches and still filters previously exported questions', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-'));
  const cachePath = path.join(tempDir, 'export-history.json');
  const config = {
    assessment: 'SAT',
    section: 'Math',
    mode: 'student',
    includeAnswerKey: false,
  };

  const initial = await loadExportHistory(cachePath);
  assert.equal(initial.size, 0);

  const snapshot = await appendExportHistory(
    config,
    [createQuestion('Q1'), createQuestion('Q2', { primary_class_cd_desc: 'Advanced Math' })],
    cachePath,
    {
      batchNumber: 1,
      filename: '001_Q1-Q2_student.pdf',
      exportedAt: '2026-03-24T03:00:00.000Z',
    }
  );
  const stored = await loadExportHistory(cachePath);

  assert.equal(stored.size, 2);
  assert.equal(snapshot.batches.length, 1);
  assert.equal(snapshot.batches[0].batchNumber, 1);
  assert.equal(snapshot.batches[0].filename, '001_Q1-Q2_student.pdf');
  assert.deepEqual(
    snapshot.batches[0].questions.map((question) => question.questionId),
    ['Q1', 'Q2']
  );
  assert.deepEqual(snapshot.batches[0].includedDomains, ['Advanced Math', 'Algebra']);

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

test('importExportHistory merges batches and remains idempotent for duplicate files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-import-'));
  const cachePath = path.join(tempDir, 'export-history.json');

  await importExportHistory(
    {
      version: 2,
      updatedAt: '2026-03-24T03:30:00.000Z',
      batches: [
        {
          id: 'batch-1',
          exportedAt: '2026-03-24T03:30:00.000Z',
          assessment: 'SAT',
          section: 'Math',
          batchNumber: 1,
          filename: '001_Q1-Q2_student.pdf',
          mode: 'student',
          includeAnswerKey: false,
          questions: [createQuestion('Q1'), createQuestion('Q2')],
        },
      ],
      legacyQuestionKeys: ['SAT::Math::Q0'],
    },
    cachePath
  );

  await importExportHistory(
    {
      version: 2,
      updatedAt: '2026-03-24T04:00:00.000Z',
      batches: [
        {
          id: 'batch-1',
          exportedAt: '2026-03-24T03:30:00.000Z',
          assessment: 'SAT',
          section: 'Math',
          batchNumber: 1,
          filename: '001_Q1-Q2_student.pdf',
          mode: 'student',
          includeAnswerKey: false,
          questions: [createQuestion('Q1'), createQuestion('Q2')],
        },
        {
          id: 'batch-2',
          exportedAt: '2026-03-24T04:00:00.000Z',
          assessment: 'SAT',
          section: 'Reading and Writing',
          batchNumber: 2,
          filename: '002_Q3-Q4_teacher.pdf',
          mode: 'teacher',
          includeAnswerKey: false,
          questions: [
            createQuestion('Q3', {
              primary_class_cd_desc: 'Craft and Structure',
              skill_desc: 'Words in context',
              difficulty: 'M',
            }),
            createQuestion('Q4', {
              primary_class_cd_desc: 'Expression of Ideas',
              skill_desc: 'Transitions',
              difficulty: 'H',
            }),
          ],
        },
      ],
      legacyQuestionKeys: ['SAT::Math::Q0'],
    },
    cachePath
  );

  const snapshot = await readExportHistorySnapshot(cachePath, { strict: true });

  assert.equal(snapshot.batches.length, 2);
  assert.equal(snapshot.legacyQuestionKeyCount, 1);
  assert.deepEqual(snapshot.questionKeys, [
    'SAT::Math::Q0',
    'SAT::Math::Q1',
    'SAT::Math::Q2',
    'SAT::Reading and Writing::Q3',
    'SAT::Reading and Writing::Q4',
  ]);
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

test('clearExportHistory removes the local cache file when present', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-clear-'));
  const cachePath = path.join(tempDir, 'export-history.json');

  await fs.writeFile(cachePath, JSON.stringify({ version: 1, questionKeys: ['SAT::Math::Q1'] }));
  await clearExportHistory(cachePath);

  const remaining = await loadExportHistory(cachePath);
  assert.equal(remaining.size, 0);
});

test('readExportHistorySnapshot migrates legacy question-key history for compatibility', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sat-export-history-legacy-'));
  const cachePath = path.join(tempDir, 'export-history.json');

  await fs.writeFile(
    cachePath,
    JSON.stringify({
      version: 1,
      updatedAt: '2026-03-23T12:00:00.000Z',
      questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
    })
  );

  const snapshot = await readExportHistorySnapshot(cachePath);

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.updatedAt, '2026-03-23T12:00:00.000Z');
  assert.equal(snapshot.batches.length, 0);
  assert.equal(snapshot.legacyQuestionKeyCount, 2);
  assert.deepEqual(snapshot.questionKeys, ['SAT::Math::Q1', 'SAT::Math::Q2']);
});

test('serializeExportHistorySnapshot emits batch-oriented export history files', () => {
  const text = serializeExportHistorySnapshot({
    version: 2,
    updatedAt: '2026-03-23T12:00:00.000Z',
    batches: [
      {
        id: 'batch-1',
        exportedAt: '2026-03-23T12:00:00.000Z',
        assessment: 'SAT',
        section: 'Math',
        batchNumber: 1,
        filename: '001_Q1-Q2_student.pdf',
        mode: 'student',
        includeAnswerKey: false,
        questionCount: 2,
        includedDomains: ['Algebra'],
        questions: [createQuestion('Q1'), createQuestion('Q2')],
      },
    ],
    legacyQuestionKeys: [],
  });
  const parsed = JSON.parse(text);

  assert.equal(parsed.version, 2);
  assert.equal(parsed.batches.length, 1);
  assert.equal(parsed.batches[0].filename, '001_Q1-Q2_student.pdf');
  assert.ok(!('questionKeys' in parsed));
});
