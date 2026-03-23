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

test('export history modal loads entries and preserves accessible open-close state', async () => {
  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    historyReader: async () => ({
      updatedAt: '2026-03-23T12:00:00.000Z',
      questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
    }),
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.locator('#export-history-trigger').waitFor();
      await page.locator('#export-history-trigger').focus();

      await page.locator('#export-history-trigger').click();
      await page.locator('#export-history-list .history-entry').first().waitFor();

      assert.equal(await page.locator('#export-history-list .history-entry').count(), 2);
      assert.match(await page.locator('#export-history-count').textContent(), /2 cached/);
      assert.match(await page.locator('#export-history-status').textContent(), /2 cached question keys available/);
      assert.match(await page.locator('#export-history-list').textContent(), /Q1/);
      assert.equal(await page.locator('#export-history-trigger').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#export-history-modal').getAttribute('aria-hidden'), 'false');

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('export-history-modal').classList.contains('hidden'));
      assert.equal(await page.locator('#export-history-trigger').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#export-history-modal').getAttribute('aria-hidden'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-history-trigger');

      await page.locator('#export-history-trigger').click();
      await page.locator('#export-history-list .history-entry').first().waitFor();
      await page.locator('#export-history-modal').click({ position: { x: 4, y: 4 } });
      await page.waitForFunction(() => document.getElementById('export-history-modal').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-history-trigger');

      await page.locator('#export-history-trigger').click();
      await page.locator('#export-history-list .history-entry').first().waitFor();
      await page.locator('#export-history-close').click();
      await page.waitForFunction(() => document.getElementById('export-history-modal').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'export-history-trigger');
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }
});
