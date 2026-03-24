import assert from 'node:assert/strict';
import test from 'node:test';

import { chromium } from 'playwright';

import { createAppServer } from '../src/server/app.mjs';

const VIEWPORTS = [
  { width: 2048, height: 1117 },
  { width: 1080, height: 900 },
];

const MIN_CLEARANCE_PX = 8;
const EXTERNAL_BASE_URL = process.env.SAT_EXPORTER_UI_BASE_URL || '';

const lookupFixture = {
  lookupData: {
    assessment: [{ id: '1', text: 'SAT' }],
    test: [
      { id: '2', text: 'Math' },
      { id: '3', text: 'Reading and Writing' },
    ],
    domain: {
      Math: [
        {
          text: 'Algebra',
          primaryClassCd: 'ALG',
          skill: [
            { text: 'Linear equations in one variable' },
            { text: 'Linear equations in two variables' },
            { text: 'Linear functions' },
            { text: 'Linear inequalities in one or two variables' },
            { text: 'Systems of two linear equations in two variables' },
          ],
        },
        {
          text: 'Advanced Math',
          primaryClassCd: 'ADM',
          skill: [
            { text: 'Equivalent expressions' },
            { text: 'Nonlinear functions' },
            { text: 'Nonlinear equations in one variable and systems of equations in two variables' },
            { text: 'Nonlinear equations in one variable' },
          ],
        },
        {
          text: 'Problem-Solving and Data Analysis',
          primaryClassCd: 'PSD',
          skill: [
            { text: 'Ratios, rates, proportional relationships, and units' },
            { text: 'Percentages' },
            { text: 'Probability and conditional probability' },
            { text: 'Inference from sample statistics and margin of error' },
          ],
        },
        {
          text: 'Geometry and Trigonometry',
          primaryClassCd: 'GEO',
          skill: [
            { text: 'Area and volume' },
            { text: 'Lines, angles, and triangles' },
            { text: 'Right triangles and trigonometry' },
          ],
        },
      ],
      'R&W': [
        {
          text: 'Craft and Structure',
          primaryClassCd: 'CAS',
          skill: [{ text: 'Words in context' }],
        },
      ],
    },
  },
};

function createPreview(input) {
  return {
    config: input,
    matchedCount: 27,
    exportCount: Math.min(input.questionCount, 27),
    totalBatches: 2,
    exportBatches: 2,
    outputDir: input.outputDir,
    availableCount: 27,
    excludedPreviouslyExportedCount: 0,
  };
}

function getBottom(box) {
  return box.y + box.height;
}

function getGap(upperBox, lowerBox) {
  return lowerBox.y - getBottom(upperBox);
}

function assertVerticalClearance(upperBox, lowerBox, label, minimum = MIN_CLEARANCE_PX) {
  const gap = getGap(upperBox, lowerBox);
  assert.ok(
    gap >= minimum,
    `${label} should clear the action row by at least ${minimum}px, received ${gap.toFixed(2)}px`
  );
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

async function createBaseUrl() {
  if (EXTERNAL_BASE_URL) {
    return {
      baseUrl: EXTERNAL_BASE_URL,
      close: async () => {},
    };
  }

  const server = createAppServer({
    lookupFetcher: async () => lookupFixture,
    previewRunner: async (input) => createPreview(input),
  });

  await new Promise((resolve) => server.listen(0, resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: async () => closeServer(server),
  };
}

async function getBoundingBox(page, selector, label) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${label} should be visible`);
  return box;
}

async function openLayout(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('#export-button').waitFor();
  await page.locator('#domains-chips .chip').first().waitFor();
}

async function expandFilters(page) {
  await page.locator('#domains-select-all').click();
  await page.locator('#skills-select-all').click();
  await page.locator('#difficulty-select-all').click();
}

async function stressPrimaryPanel(page) {
  const metrics = await page.evaluate(() => {
    const body = document.querySelector('.panel-form-body');
    const grid = document.querySelector('.settings-panel-flags .toggle-grid');
    const sample = grid?.querySelector('.toggle-card:last-child');

    if (!body || !grid || !sample) {
      throw new Error('Unable to locate the desktop configuration controls.');
    }

    for (let index = grid.children.length; index < 27; index += 1) {
      const clone = sample.cloneNode(true);
      const input = clone.querySelector('input');
      const title = clone.querySelector('strong');
      const detail = clone.querySelector('small');

      if (input) {
        input.checked = false;
        input.name = `layout-regression-${index}`;
      }

      if (title) {
        title.textContent = `Layout regression ${index}`;
      }

      if (detail) {
        detail.textContent = 'Stretches the desktop controls to verify scroll clearance above the action row.';
      }

      grid.append(clone);
    }

    body.scrollTop = body.scrollHeight;

    return {
      overflowY: getComputedStyle(body).overflowY,
      scrollTop: body.scrollTop,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
    };
  });

  assert.equal(metrics.overflowY, 'auto');
  assert.ok(metrics.scrollHeight > metrics.clientHeight, 'desktop config body should become scrollable under stress');
  assert.ok(metrics.scrollTop > 0, 'desktop config body should scroll to reveal the final control');
}

test('desktop layout keeps the left controls clear of the bottom action row', async () => {
  const { baseUrl, close } = await createBaseUrl();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage({ viewport });

      try {
        await openLayout(page, baseUrl);
        await expandFilters(page);

        const filterPanelBox = await getBoundingBox(page, '.panel-form-filters', 'filter panel');
        const actionRowBox = await getBoundingBox(page, '.workspace-action-row', 'action row');
        assertVerticalClearance(
          filterPanelBox,
          actionRowBox,
          `viewport ${viewport.width}x${viewport.height} filter bench`
        );

        if (viewport.width > 1080) {
          await stressPrimaryPanel(page);

          const lastPrimaryControlBox = await getBoundingBox(
            page,
            '.settings-panel-flags .toggle-card:last-child',
            'last primary control'
          );
          const refreshedActionRowBox = await getBoundingBox(page, '.workspace-action-row', 'action row');
          assertVerticalClearance(
            lastPrimaryControlBox,
            refreshedActionRowBox,
            `viewport ${viewport.width}x${viewport.height} left controls`
          );
          continue;
        }

        const primaryPanelBox = await getBoundingBox(page, '.panel-form-primary', 'primary panel');
        assertVerticalClearance(
          primaryPanelBox,
          actionRowBox,
          `viewport ${viewport.width}x${viewport.height} primary panel`
        );
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await close();
  }
});
