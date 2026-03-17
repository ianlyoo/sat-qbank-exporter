import path from 'node:path';

import { DEFAULT_EXPORT_OPTIONS, DIFFICULTY_CODES, EXPORT_MODES } from './constants.mjs';

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

export function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer, got "${value}"`);
  }

  return parsed;
}

export function parseList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function shuffleArray(items) {
  const clone = [...items];

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }

  return clone;
}

export function difficultyLabel(code) {
  switch (code) {
    case 'E':
      return 'Easy';
    case 'M':
      return 'Medium';
    case 'H':
      return 'Hard';
    default:
      return code;
  }
}

export function normalizeDifficultyFilters(values) {
  const codes = new Set();

  for (const value of values) {
    const code = DIFFICULTY_CODES[String(value).toLowerCase()];
    if (!code) {
      throw new Error(`Unknown difficulty "${value}". Use Easy, Medium, or Hard.`);
    }
    codes.add(code);
  }

  return codes;
}

export function applyFilters({ questions, difficultyCodes, allowedSkills, excludeActive, activeIds }) {
  return questions.filter((question) => {
    if (difficultyCodes.size && !difficultyCodes.has(question.difficulty)) {
      return false;
    }

    if (allowedSkills.size && !allowedSkills.has(question.skill_desc)) {
      return false;
    }

    if (excludeActive && question.external_id && activeIds.has(question.external_id)) {
      return false;
    }

    return true;
  });
}

export function buildFilename(batchNumber, batch, mode) {
  const firstId = batch[0].questionId;
  const lastId = batch[batch.length - 1].questionId;
  return `${String(batchNumber).padStart(3, '0')}_${firstId}-${lastId}_${slugify(mode)}.pdf`;
}

export function normalizeExportOptions(input = {}) {
  const merged = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...input,
  };

  const normalized = {
    assessment: String(merged.assessment || '').trim(),
    section: String(merged.section || '').trim(),
    domains: parseList(merged.domains),
    skills: parseList(merged.skills),
    difficulty: parseList(merged.difficulty),
    questionCount: parseInteger(merged.questionCount, DEFAULT_EXPORT_OPTIONS.questionCount),
    chunkSize: parseInteger(merged.chunkSize, DEFAULT_EXPORT_OPTIONS.chunkSize),
    mode: String(merged.mode || DEFAULT_EXPORT_OPTIONS.mode),
    outputDir: path.resolve(String(merged.outputDir || DEFAULT_EXPORT_OPTIONS.outputDir)),
    excludeActive: parseBoolean(merged.excludeActive, DEFAULT_EXPORT_OPTIONS.excludeActive),
    excludeExported: parseBoolean(merged.excludeExported, DEFAULT_EXPORT_OPTIONS.excludeExported),
    shuffle: parseBoolean(merged.shuffle, DEFAULT_EXPORT_OPTIONS.shuffle),
    fromPage: parseInteger(merged.fromPage, DEFAULT_EXPORT_OPTIONS.fromPage),
    toPage:
      merged.toPage === null || merged.toPage === undefined || merged.toPage === ''
        ? null
        : parseInteger(merged.toPage, null),
    headed: parseBoolean(merged.headed, DEFAULT_EXPORT_OPTIONS.headed),
  };

  if (!normalized.assessment || !normalized.section || !normalized.domains.length) {
    throw new Error('Missing required fields: assessment, section, and at least one domain.');
  }

  if (!Object.values(EXPORT_MODES).includes(normalized.mode)) {
    throw new Error(
      `Unknown mode "${normalized.mode}". Use one of: ${Object.keys(EXPORT_MODES).join(', ')}`
    );
  }

  if (normalized.questionCount !== null && normalized.questionCount < 1) {
    throw new Error('Question count must be at least 1.');
  }

  if (normalized.chunkSize < 1) {
    throw new Error('Questions per PDF must be at least 1.');
  }

  if (normalized.fromPage < 1) {
    throw new Error('First PDF batch must be at least 1.');
  }

  if (normalized.toPage !== null && normalized.toPage < normalized.fromPage) {
    throw new Error('Last PDF batch must be greater than or equal to the first batch.');
  }

  return normalized;
}

export function selectQuestions(questions, questionCount, shuffle) {
  const chosen = shuffle ? shuffleArray(questions) : [...questions];

  if (questionCount === null || questionCount === undefined) {
    return chosen;
  }

  return chosen.slice(0, questionCount);
}

export function createHeaderText({ assessment, section, domains, batchNumber }) {
  return `${assessment} ${section} ${domains.join(', ')} - Batch ${batchNumber}`;
}

export function createActiveIdSet(lookup, section) {
  return section === 'Math'
    ? new Set(lookup.mathLiveItems || [])
    : new Set(lookup.readingLiveItems || []);
}

export function mapLookupForUi(lookupData) {
  return {
    assessments: (lookupData.assessment || []).map((item) => item.text),
    sections: (lookupData.test || []).map((item) => item.text),
    domainsBySection: {
      Math: (lookupData.domain?.Math || []).map((domain) => ({
        label: domain.text,
        code: domain.primaryClassCd,
        skills: (domain.skill || []).map((skill) => skill.text),
      })),
      'Reading and Writing': (lookupData.domain?.['R&W'] || []).map((domain) => ({
        label: domain.text,
        code: domain.primaryClassCd,
        skills: (domain.skill || []).map((skill) => skill.text),
      })),
    },
  };
}

export function resolveLookup(lookupData, assessmentLabel, sectionLabel, domainLabels, skillLabels) {
  const assessment = lookupData.assessment.find((item) => item.text === assessmentLabel);
  if (!assessment) {
    throw new Error(`Unknown assessment: ${assessmentLabel}`);
  }

  const section = lookupData.test.find((item) => item.text === sectionLabel);
  if (!section) {
    throw new Error(`Unknown section: ${sectionLabel}`);
  }

  const domainGroup = sectionLabel === 'Math' ? lookupData.domain.Math : lookupData.domain['R&W'];
  const domains = domainLabels.map((label) => {
    const domain = domainGroup.find((item) => item.text === label);
    if (!domain) {
      throw new Error(`Unknown domain "${label}" for section "${sectionLabel}"`);
    }
    return domain;
  });

  const allowedSkills = new Set();
  if (skillLabels.length) {
    for (const label of skillLabels) {
      const foundSkill = domains
        .flatMap((domain) => domain.skill || [])
        .find((skill) => skill.text === label);

      if (!foundSkill) {
        throw new Error(`Unknown skill "${label}" for the selected domains`);
      }

      allowedSkills.add(foundSkill.text);
    }
  }

  return {
    assessmentId: Number.parseInt(assessment.id, 10),
    sectionId: Number.parseInt(section.id, 10),
    domainCodes: domains.map((domain) => domain.primaryClassCd),
    allowedSkills,
  };
}

export function normalizeLegacyAnswerOptions(answer = {}) {
  const choices = answer.choices || {};
  return Object.entries(choices).map(([letter, choice]) => ({
    letter: String(letter).toUpperCase(),
    content: choice.body || choice.content || '',
  }));
}

export function normalizeLegacyCorrectAnswer(answer = {}) {
  if (answer.correct_choice) {
    return [String(answer.correct_choice).toUpperCase()];
  }

  if (answer.correct_spr?.absolute?.length) {
    return answer.correct_spr.absolute.map((item) => String(item));
  }

  return [];
}
