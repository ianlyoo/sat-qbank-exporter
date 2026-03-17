import assert from 'node:assert/strict';
import test from 'node:test';

import { __testDoesPreviewMatchForm, __testIsPreviewComparable } from '../public/app.js';

function createBaseConfig() {
  return {
    assessment: 'SAT',
    section: 'Math',
    domains: ['Algebra', 'Advanced Math'],
    skills: ['Linear functions', 'Quadratic functions'],
    difficulty: ['Easy', 'Medium'],
    questionCount: 20,
    chunkSize: 20,
    mode: 'student',
    includeAnswerKey: false,
    outputDir: './output',
    shuffle: true,
    excludeActive: false,
    excludeExported: false,
  };
}

test('preview comparison ignores selection order when config is effectively unchanged', () => {
  const preview = {
    config: createBaseConfig(),
  };
  const form = {
    ...createBaseConfig(),
    domains: ['Advanced Math', 'Algebra'],
    skills: ['Quadratic functions', 'Linear functions'],
    difficulty: ['Medium', 'Easy'],
  };

  assert.equal(__testDoesPreviewMatchForm(preview, form), true);
});

test('preview comparison detects real config changes', () => {
  const preview = {
    config: createBaseConfig(),
  };
  const form = {
    ...createBaseConfig(),
    difficulty: ['Easy'],
  };

  assert.equal(__testDoesPreviewMatchForm(preview, form), false);
});

test('preview comparability requires at least one domain, skill, and difficulty', () => {
  assert.equal(
    __testIsPreviewComparable({
      ...createBaseConfig(),
      domains: [],
    }),
    false
  );

  assert.equal(
    __testIsPreviewComparable({
      ...createBaseConfig(),
      skills: [],
    }),
    false
  );

  assert.equal(
    __testIsPreviewComparable({
      ...createBaseConfig(),
      difficulty: [],
    }),
    false
  );

  assert.equal(__testIsPreviewComparable(createBaseConfig()), true);
});
