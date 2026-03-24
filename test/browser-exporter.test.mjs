import assert from 'node:assert/strict';
import test from 'node:test';

import { __testResolveBrowserRenderOptions } from '../public/browser-exporter.js';

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
