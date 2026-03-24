import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../src/server/app.mjs';

const lookupFixture = {
  lookupData: {
    assessment: [{ id: '1', text: 'SAT' }],
    test: [{ id: '2', text: 'Math' }],
    domain: {
      Math: [{ text: 'Algebra', primaryClassCd: 'ALG', skill: [] }],
      'R&W': [],
    },
  },
};

function createBasePayload() {
  return {
    assessment: 'SAT',
    section: 'Math',
    domains: ['Algebra'],
    skills: [],
    difficulty: [],
    questionCount: 5,
    chunkSize: 5,
    mode: 'student',
    outputDir: './downloads/test-server',
    shuffle: true,
    excludeActive: false,
  };
}

test('server blocks overlapping exports and exposes active job status', async () => {
  let releaseExport;
  const exportStarted = new Promise((resolve) => {
    releaseExport = resolve;
  });

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    previewRunner: async (input) => ({
      config: input,
      matchedCount: 5,
      exportCount: 5,
      totalBatches: 1,
      exportBatches: 1,
      outputDir: input.outputDir,
    }),
    exportRunner: async (input, { onProgress }) => {
      onProgress({
        state: 'running',
        phase: 'rendering',
        message: 'Rendering PDF 1 of 1',
        currentBatch: 1,
        totalBatches: 1,
        outputDir: input.outputDir,
        savedFiles: [],
      });
      await exportStarted;
      return {
        matchedCount: 5,
        exportCount: 5,
        totalBatches: 1,
        savedFiles: [`${input.outputDir}/001_Q1-Q5_student.pdf`],
        outputDir: input.outputDir,
        config: input,
      };
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const firstResponse = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBasePayload()),
    });
    const firstBody = await firstResponse.json();

    assert.equal(firstResponse.status, 202);
    assert.ok(firstBody.jobId);

    const activeResponse = await fetch(`${baseUrl}/api/status`);
    const activeBody = await activeResponse.json();

    assert.equal(activeResponse.status, 200);
    assert.equal(activeBody.job.state, 'running');
    assert.equal(activeBody.job.phase, 'rendering');

    const secondResponse = await fetch(`${baseUrl}/api/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBasePayload()),
    });
    const secondBody = await secondResponse.json();

    assert.equal(secondResponse.status, 409);
    assert.equal(secondBody.jobId, firstBody.jobId);

    releaseExport();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const idleResponse = await fetch(`${baseUrl}/api/status`);
    const idleBody = await idleResponse.json();

    assert.equal(idleResponse.status, 200);
    assert.equal(idleBody.job, null);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('server clears the local export history cache on demand', async () => {
  let cleared = 0;

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    clearHistory: async () => {
      cleared += 1;
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/export-history/clear`, {
      method: 'POST',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(cleared, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('server exposes export history entries for the in-app modal', async () => {
  const historySnapshot = {
    updatedAt: '2026-03-23T12:00:00.000Z',
    questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
    legacyQuestionKeyCount: 0,
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
        questions: [
          { questionId: 'Q1', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Easy' },
          { questionId: 'Q2', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Medium' },
        ],
      },
    ],
  };

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    historyReader: async () => historySnapshot,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/export-history`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      history: {
        batchCount: 1,
        questionCount: 2,
        legacyQuestionKeyCount: 0,
        updatedAt: '2026-03-23T12:00:00.000Z',
        batches: historySnapshot.batches,
      },
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('server downloads export history as a JSON attachment', async () => {
  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    historyReader: async () => ({
      version: 2,
      updatedAt: '2026-03-23T12:00:00.000Z',
      legacyQuestionKeys: [],
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
          questions: [
            { questionId: 'Q1', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Easy' },
            { questionId: 'Q2', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Medium' },
          ],
        },
      ],
      questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
      legacyQuestionKeyCount: 0,
    }),
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/export-history/download`);
    const text = await response.text();
    const parsed = JSON.parse(text);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') || '', /sat-export-history\.json/);
    assert.equal(parsed.version, 2);
    assert.equal(parsed.batches.length, 1);
    assert.equal(parsed.batches[0].filename, '001_Q1-Q2_student.pdf');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test('server imports export history files and returns the merged batch view', async () => {
  let importedHistory = null;

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    historyImporter: async (history) => {
      importedHistory = history;
      return {
        updatedAt: '2026-03-24T12:00:00.000Z',
        questionKeys: ['SAT::Math::Q1'],
        legacyQuestionKeyCount: 0,
        batches: [
          {
            id: 'batch-1',
            exportedAt: '2026-03-24T12:00:00.000Z',
            assessment: 'SAT',
            section: 'Math',
            batchNumber: 1,
            filename: '001_Q1_student.pdf',
            mode: 'student',
            includeAnswerKey: false,
            questionCount: 1,
            includedDomains: ['Algebra'],
            questions: [
              { questionId: 'Q1', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Easy' },
            ],
          },
        ],
      };
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/export-history/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        history: {
          version: 2,
          updatedAt: '2026-03-24T12:00:00.000Z',
          legacyQuestionKeys: [],
          batches: [
            {
              id: 'batch-1',
              exportedAt: '2026-03-24T12:00:00.000Z',
              assessment: 'SAT',
              section: 'Math',
              batchNumber: 1,
              filename: '001_Q1_student.pdf',
              mode: 'student',
              includeAnswerKey: false,
              questions: [
                { questionId: 'Q1', domain: 'Algebra', skill: 'Linear functions', difficultyLabel: 'Easy' },
              ],
            },
          ],
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(importedHistory.batches.length, 1);
    assert.equal(body.history.batchCount, 1);
    assert.equal(body.history.questionCount, 1);
    assert.equal(body.history.batches[0].filename, '001_Q1_student.pdf');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
