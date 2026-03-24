import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { __testDoesPreviewMatchForm, __testFormatMode, __testIsPreviewComparable } from '../public/app.js';

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

test('preview mode labels use the updated UI copy', () => {
  assert.equal(__testFormatMode('student'), 'Default');
  assert.equal(__testFormatMode('teacher'), 'Default + Key');
  assert.equal(__testFormatMode('clean'), 'Clean');
  assert.equal(__testFormatMode('student', true), 'Default + Answer key');
  assert.equal(__testFormatMode('clean', true), 'Clean + Answer key');
});

test('mode options use the updated labels and expose the answer key toggle', async () => {
  const indexPath = fileURLToPath(new URL('../public/index.html', import.meta.url));
  const html = await fs.readFile(indexPath, 'utf8');

  assert.match(html, /<strong>Default<\/strong>/);
  assert.match(html, /<strong>Clean<\/strong>/);
  assert.match(html, /<strong>Answer key included<\/strong>/);
  assert.match(html, /Questions only\./);
  assert.match(html, /Minimal print layout\./);
  assert.match(html, /Add an answer key and rationale appendix after the questions\./);
  assert.doesNotMatch(html, /Output directory/);
  assert.doesNotMatch(html, /id="output-dir"/);
  assert.match(html, /id="include-answer-key"/);
});
