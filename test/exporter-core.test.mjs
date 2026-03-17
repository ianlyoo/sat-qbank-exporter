import assert from 'node:assert/strict';
import test from 'node:test';

import { EXPORT_MODES } from '../src/core/constants.mjs';
import {
  applyFilters,
  buildFilename,
  normalizeDifficultyFilters,
  normalizeExportOptions,
  resolveLookup,
  selectQuestions,
} from '../src/core/helpers.mjs';
import { renderDocumentHtml } from '../src/core/render.mjs';

test('normalizeExportOptions applies defaults and resolves output path', () => {
  const options = normalizeExportOptions({
    assessment: 'SAT',
    section: 'Math',
    domains: ['Algebra'],
    outputDir: './output/math',
  });

  assert.equal(options.mode, EXPORT_MODES.student);
  assert.equal(options.questionCount, 20);
  assert.equal(options.shuffle, true);
  assert.equal(options.excludeExported, false);
  assert.match(options.outputDir, /output\/math$|output\\math$/);
});

test('resolveLookup maps labels to internal ids and validates skills', () => {
  const lookupData = {
    assessment: [{ id: '1', text: 'SAT' }],
    test: [{ id: '2', text: 'Math' }],
    domain: {
      Math: [
        {
          text: 'Algebra',
          primaryClassCd: 'ALG',
          skill: [{ text: 'Linear functions' }],
        },
      ],
      'R&W': [],
    },
  };

  const resolved = resolveLookup(lookupData, 'SAT', 'Math', ['Algebra'], ['Linear functions']);
  assert.equal(resolved.assessmentId, 1);
  assert.equal(resolved.sectionId, 2);
  assert.deepEqual(resolved.domainCodes, ['ALG']);
  assert.equal(resolved.allowedSkills.has('Linear functions'), true);
});

test('applyFilters removes inactive, disallowed skill, and wrong difficulty items', () => {
  const questions = [
    { questionId: '1', difficulty: 'E', skill_desc: 'Linear functions', external_id: 'a1' },
    { questionId: '2', difficulty: 'M', skill_desc: 'Quadratics', external_id: 'a2' },
    { questionId: '3', difficulty: 'E', skill_desc: 'Linear functions', external_id: 'a3' },
  ];

  const filtered = applyFilters({
    questions,
    difficultyCodes: normalizeDifficultyFilters(['Easy']),
    allowedSkills: new Set(['Linear functions']),
    excludeActive: true,
    activeIds: new Set(['a3']),
  });

  assert.deepEqual(
    filtered.map((item) => item.questionId),
    ['1']
  );
});

test('selectQuestions returns bounded randomized copies', () => {
  const input = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const selected = selectQuestions(input, 2, true);

  assert.equal(selected.length, 2);
  assert.equal(input.length, 4);
});

test('buildFilename uses batch number and mode slug', () => {
  const filename = buildFilename(
    3,
    [
      { questionId: 'Q1' },
      { questionId: 'Q9' },
    ],
    'teacher'
  );

  assert.equal(filename, '003_Q1-Q9_teacher.pdf');
});

test('renderDocumentHtml includes teacher answer block only in teacher mode', () => {
  const batch = [
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
  ];

  const teacherHtml = renderDocumentHtml({
    batch,
    mode: EXPORT_MODES.teacher,
    headerText: 'SAT Math - Batch 1',
  });
  const cleanHtml = renderDocumentHtml({
    batch,
    mode: EXPORT_MODES.clean,
    headerText: 'SAT Math - Batch 1',
  });

  assert.match(teacherHtml, /Correct Answer/);
  assert.doesNotMatch(cleanHtml, /Correct Answer/);
  assert.doesNotMatch(cleanHtml, /Question Q1/);
});
