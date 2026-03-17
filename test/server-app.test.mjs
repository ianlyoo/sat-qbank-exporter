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
