import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __testMapBrowserHistoryPayload,
  __testResolveBrowserRenderOptions,
} from '../public/browser-exporter.js';

test('browser Default + Key exports render as question pages followed by an appendix', () => {
  assert.deepEqual(
    __testResolveBrowserRenderOptions({
      mode: 'teacher',
      includeAnswerKey: false,
    }),
    {
      mode: 'student',
      includeAnswerKey: true,
    }
  );
});

test('browser Default exports keep their existing render settings', () => {
  assert.deepEqual(
    __testResolveBrowserRenderOptions({
      mode: 'student',
      includeAnswerKey: false,
    }),
    {
      mode: 'student',
      includeAnswerKey: false,
    }
  );
});

test('browser history payload exposes question counts for the UI modal', () => {
  assert.deepEqual(
    __testMapBrowserHistoryPayload({
      updatedAt: '2026-03-24T11:19:18.000Z',
      legacyQuestionKeyCount: 0,
      questionKeys: ['SAT::Math::Q1', 'SAT::Math::Q2'],
      batches: [{ id: 'batch-1' }, { id: 'batch-2' }],
    }),
    {
      batchCount: 2,
      questionCount: 2,
      legacyQuestionKeyCount: 0,
      updatedAt: '2026-03-24T11:19:18.000Z',
      batches: [{ id: 'batch-1' }, { id: 'batch-2' }],
    }
  );
});
