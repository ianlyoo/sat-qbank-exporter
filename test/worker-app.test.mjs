import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkerServer } from '../src/server/worker-app.mjs';

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
    outputDir: './downloads/test-worker',
    shuffle: true,
    excludeActive: false,
  };
}

test('worker server starts exports and exposes active job status', async () => {
  let releaseExport;
  const exportStarted = new Promise((resolve) => {
    releaseExport = resolve;
  });

  const server = createWorkerServer({
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
    const createResponse = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createBasePayload()),
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 202);
    assert.ok(createBody.jobId);

    const activeResponse = await fetch(`${baseUrl}/jobs/active`);
    const activeBody = await activeResponse.json();

    assert.equal(activeResponse.status, 200);
    assert.equal(activeBody.job.state, 'running');
    assert.equal(activeBody.job.phase, 'rendering');

    releaseExport();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const finishedResponse = await fetch(`${baseUrl}/jobs/${createBody.jobId}`);
    const finishedBody = await finishedResponse.json();

    assert.equal(finishedResponse.status, 200);
    assert.equal(finishedBody.job.state, 'completed');
    assert.equal(finishedBody.job.savedFiles.length, 1);
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

test('worker server exposes app-compatible api aliases for static frontend hosting', async () => {
  const server = createWorkerServer({
    lookupFetcher: async () => ({
      lookupData: {
        assessment: [{ id: '1', text: 'SAT' }],
        test: [{ id: '2', text: 'Math' }],
        domain: {
          Math: [{ text: 'Algebra', primaryClassCd: 'ALG', skill: [] }],
          'R&W': [],
        },
      },
    }),
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const defaultsResponse = await fetch(`${baseUrl}/api/defaults`);
    const defaultsBody = await defaultsResponse.json();

    assert.equal(defaultsResponse.status, 200);
    assert.ok(defaultsBody.defaults);
    assert.equal(defaultsBody.defaults.assessment, 'SAT');

    const lookupResponse = await fetch(`${baseUrl}/api/lookup`);
    const lookupBody = await lookupResponse.json();

    assert.equal(lookupResponse.status, 200);
    assert.equal(lookupBody.lookup.assessments[0], 'SAT');
    assert.equal(lookupBody.lookup.sections[0], 'Math');
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
