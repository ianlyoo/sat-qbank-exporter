import assert from 'node:assert/strict';
import test from 'node:test';

import { renderDocumentHtml } from '../public/render-document.js';

test('browser render document module builds printable packet html', () => {
  const html = renderDocumentHtml({
    batch: [
      {
        questionId: 'Q1',
        domain: 'Algebra',
        skill: 'Linear functions',
        difficultyLabel: 'Easy',
        prompt: '<p>Prompt</p>',
        stem: '<p>Stem</p>',
        answerOptions: [{ letter: 'A', content: '<p>Choice</p>' }],
        correctAnswer: ['A'],
        rationale: '<p>Because.</p>',
      },
    ],
    mode: 'student',
    includeAnswerKey: false,
    headerText: 'SAT Math - Batch 1',
  });

  assert.match(html, /SAT Math - Batch 1/);
  assert.match(html, /Question Q1/);
  assert.match(html, /__SAT_PDF_LAYOUT_DONE__/);
});

test('browser render document keeps answer appendix separate when includeAnswerKey is enabled', () => {
  const html = renderDocumentHtml({
    batch: [
      {
        questionId: 'Q1',
        domain: 'Algebra',
        skill: 'Linear functions',
        difficultyLabel: 'Easy',
        prompt: '<p>Prompt</p>',
        stem: '<p>Stem</p>',
        answerOptions: [{ letter: 'A', content: '<p>Choice</p>' }],
        correctAnswer: ['A'],
        rationale: '<p>Because.</p>',
      },
    ],
    mode: 'teacher',
    includeAnswerKey: true,
    headerText: 'SAT Math - Batch 1',
  });

  assert.match(html, /Answer Key and Rationale/);
  assert.doesNotMatch(html, /class="teacher-block"/);
});
