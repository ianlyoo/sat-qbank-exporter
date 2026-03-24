import assert from 'node:assert/strict';
import test from 'node:test';

import { chromium } from 'playwright';

import { createAppServer } from '../src/server/app.mjs';

const lookupFixture = {
  lookupData: {
    assessment: [{ id: '1', text: 'SAT' }],
    test: [{ id: '2', text: 'Math' }],
    domain: {
      Math: [{ text: 'Algebra', primaryClassCd: 'ALG', skill: [{ text: 'Linear functions' }] }],
      'R&W': [],
    },
  },
};

function buildBatch({
  id,
  exportedAt,
  batchNumber,
  filename,
  mode = 'student',
  questions,
}) {
  return {
    id,
    exportedAt,
    assessment: 'SAT',
    section: 'Math',
    batchNumber,
    filename,
    mode,
    includeAnswerKey: false,
    questionCount: questions.length,
    includedDomains: [...new Set(questions.map((question) => question.domain))].sort(),
    questions,
  };
}

function cloneHistory(history) {
  return JSON.parse(JSON.stringify(history));
}

function createQuestion(questionId, difficultyLabel = 'Easy') {
  return {
    questionId,
    domain: 'Algebra',
    skill: 'Linear functions',
    difficultyLabel,
  };
}

async function closeServer(server) {
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

test('manage export history modal supports batch review, import, clear, and accessible open-close state', async () => {
  let historyState = {
    updatedAt: '2026-03-23T12:00:00.000Z',
    questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
    legacyQuestionKeyCount: 0,
    batches: [
      buildBatch({
        id: 'batch-1',
        exportedAt: '2026-03-23T12:00:00.000Z',
        batchNumber: 1,
        filename: '001_Q1-Q2_student.pdf',
        questions: [createQuestion('Q1'), createQuestion('Q2', 'Medium')],
      }),
    ],
  };

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    historyReader: async () => cloneHistory(historyState),
    clearHistory: async () => {
      historyState = {
        updatedAt: null,
        questionKeys: [],
        legacyQuestionKeyCount: 0,
        batches: [],
      };
    },
    historyImporter: async (history) => {
      const nextBatches = [...historyState.batches, ...(history.batches || [])];
      const questionKeys = new Set(historyState.questionKeys);

      (history.batches || []).forEach((batch) => {
        (batch.questions || []).forEach((question) => {
          questionKeys.add(`SAT::Math::${question.questionId}`);
        });
      });

      historyState = {
        updatedAt: '2026-03-24T12:00:00.000Z',
        questionKeys: [...questionKeys].sort(),
        legacyQuestionKeyCount: 0,
        batches: nextBatches,
      };

      return cloneHistory(historyState);
    },
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.locator('.workspace-action-row #export-history-trigger').waitFor();
      assert.match(await page.locator('#export-history-trigger').textContent(), /Manage export history/);
      await page.locator('#export-history-trigger').focus();

      await page.locator('#export-history-trigger').click();
      await page.locator('#export-history-list .history-entry').first().waitFor();

      assert.equal(await page.locator('#export-history-list .history-entry').count(), 1);
      assert.match(await page.locator('#export-history-count').textContent(), /1 batches/);
      assert.match(await page.locator('#export-history-question-count').textContent(), /2 questions/);
      assert.match(await page.locator('#export-history-status').textContent(), /1 batch covering 2 questions/);
      assert.equal(await page.locator('#export-history-modal').getAttribute('aria-hidden'), 'false');
      assert.equal(await page.locator('#export-history-trigger').getAttribute('aria-expanded'), 'true');
      await page.locator('#export-history-download').waitFor();
      await page.locator('#export-history-import').waitFor();
      await page.locator('#clear-history-button').waitFor();

      await page.locator('#export-history-list .history-entry-summary').first().click();
      await page.locator('#export-history-list .history-question-item').first().waitFor();
      assert.match(await page.locator('#export-history-list').textContent(), /SAT Math - Batch 1/);
      assert.match(await page.locator('#export-history-list').textContent(), /Q1/);

      await page.locator('#export-history-import-input').setInputFiles({
        name: 'sat-export-history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            version: 2,
            updatedAt: '2026-03-24T12:00:00.000Z',
            legacyQuestionKeys: [],
            batches: [
              buildBatch({
                id: 'batch-2',
                exportedAt: '2026-03-24T12:00:00.000Z',
                batchNumber: 2,
                filename: '002_Q3_student.pdf',
                questions: [createQuestion('Q3', 'Hard')],
              }),
            ],
          })
        ),
      });

      await page.waitForFunction(() => document.getElementById('export-history-count').textContent.includes('2 batches'));
      assert.equal(await page.locator('#export-history-list .history-entry').count(), 2);
      assert.match(await page.locator('#export-history-question-count').textContent(), /3 questions/);

      await page.locator('#clear-history-button').click();
      assert.match(await page.locator('#clear-history-button').textContent(), /Are You Sure\?/);
      await page.locator('#clear-history-button').click();
      await page.waitForFunction(() => document.getElementById('export-history-feedback').textContent.includes('No batch history'));
      assert.equal(await page.locator('#export-history-list .history-entry').count(), 0);
      assert.match(await page.locator('#export-history-count').textContent(), /0 batches/);
      assert.match(await page.locator('#export-history-question-count').textContent(), /0 questions/);

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('export-history-modal').classList.contains('hidden'));
      assert.equal(await page.locator('#export-history-trigger').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#export-history-modal').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-history-trigger');
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }
});
