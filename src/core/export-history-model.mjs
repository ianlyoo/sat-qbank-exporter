import { createHash } from 'node:crypto';

const EXPORT_HISTORY_VERSION = 2;

export function createInvalidCacheError(
  message = 'The local export-history cache is invalid. Remove .sat-exporter/export-history.json and try again.'
) {
  return new Error(message);
}

function createQuestionKey(config, question) {
  return createQuestionKeyFromParts(config.assessment, config.section, question.questionId);
}

function createQuestionKeyFromParts(assessment, section, questionId) {
  return `${assessment}::${section}::${questionId}`;
}

export function createEmptySnapshot() {
  return {
    version: EXPORT_HISTORY_VERSION,
    updatedAt: null,
    batches: [],
    legacyQuestionKeys: [],
    legacyQuestionKeyCount: 0,
    questionKeys: [],
  };
}

function toSortedUniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean))].sort();
}

function normalizeDifficultyLabel(value) {
  switch (String(value || '').trim()) {
    case 'E':
      return 'Easy';
    case 'M':
      return 'Medium';
    case 'H':
      return 'Hard';
    default:
      return String(value || '').trim();
  }
}

function normalizeQuestionEntry(question) {
  if (!question || typeof question !== 'object') {
    return null;
  }

  const questionId = String(question.questionId || '').trim();
  if (!questionId) {
    return null;
  }

  return {
    questionId,
    domain: String(question.domain || question.primary_class_cd_desc || '').trim(),
    skill: String(question.skill || question.skill_desc || '').trim(),
    difficultyLabel: normalizeDifficultyLabel(
      question.difficultyLabel ?? question.difficulty_label ?? question.difficulty ?? ''
    ),
  };
}

function createBatchId(entry) {
  const payload = JSON.stringify({
    assessment: entry.assessment,
    section: entry.section,
    batchNumber: entry.batchNumber ?? null,
    filename: entry.filename || '',
    exportedAt: entry.exportedAt || '',
    mode: entry.mode || '',
    includeAnswerKey: Boolean(entry.includeAnswerKey),
    questionIds: entry.questions.map((question) => question.questionId),
  });

  return createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function normalizeBatchEntry(entry, { strict = false } = {}) {
  if (!entry || typeof entry !== 'object') {
    if (strict) {
      throw createInvalidCacheError('The selected export-history file is invalid.');
    }

    return null;
  }

  const assessment = String(entry.assessment || '').trim();
  const section = String(entry.section || '').trim();
  const questions = (Array.isArray(entry.questions) ? entry.questions : [])
    .map((question) => normalizeQuestionEntry(question))
    .filter(Boolean);

  if (!assessment || !section || !questions.length) {
    if (strict) {
      throw createInvalidCacheError('The selected export-history file is invalid.');
    }

    return null;
  }

  const batchNumber =
    typeof entry.batchNumber === 'number' && Number.isFinite(entry.batchNumber) ? entry.batchNumber : null;
  const exportedAt = typeof entry.exportedAt === 'string' ? entry.exportedAt : null;
  const filename = String(entry.filename || '').trim();
  const mode = String(entry.mode || 'student').trim() || 'student';
  const includeAnswerKey = Boolean(entry.includeAnswerKey);
  const includedDomains = toSortedUniqueStrings(
    Array.isArray(entry.includedDomains) && entry.includedDomains.length
      ? entry.includedDomains
      : questions.map((question) => question.domain)
  );
  const questionCount =
    typeof entry.questionCount === 'number' && Number.isFinite(entry.questionCount)
      ? entry.questionCount
      : questions.length;

  const normalized = {
    id: String(entry.id || '').trim(),
    exportedAt,
    assessment,
    section,
    batchNumber,
    filename,
    mode,
    includeAnswerKey,
    questionCount,
    includedDomains,
    questions,
  };

  normalized.id = normalized.id || createBatchId(normalized);
  return normalized;
}

function sortBatches(entries) {
  return [...entries].sort((left, right) => {
    const leftTime = left.exportedAt ? new Date(left.exportedAt).getTime() : 0;
    const rightTime = right.exportedAt ? new Date(right.exportedAt).getTime() : 0;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    if ((left.batchNumber || 0) !== (right.batchNumber || 0)) {
      return (right.batchNumber || 0) - (left.batchNumber || 0);
    }

    return right.id.localeCompare(left.id);
  });
}

export function normalizeExportHistoryData(parsed, { strict = false } = {}) {
  if (!parsed || typeof parsed !== 'object') {
    if (strict) {
      throw createInvalidCacheError();
    }

    return createEmptySnapshot();
  }

  const isBatchHistory = Array.isArray(parsed.batches) || Array.isArray(parsed.legacyQuestionKeys);
  const batches = isBatchHistory
    ? (Array.isArray(parsed.batches) ? parsed.batches : [])
        .map((entry) => normalizeBatchEntry(entry, { strict }))
        .filter(Boolean)
    : [];
  const legacyQuestionKeys = isBatchHistory
    ? toSortedUniqueStrings(parsed.legacyQuestionKeys)
    : Array.isArray(parsed.questionKeys)
      ? toSortedUniqueStrings(parsed.questionKeys)
      : strict
        ? (() => {
            throw createInvalidCacheError();
          })()
        : [];
  const questionKeySet = new Set(legacyQuestionKeys);

  batches.forEach((batch) => {
    batch.questions.forEach((question) => {
      questionKeySet.add(createQuestionKeyFromParts(batch.assessment, batch.section, question.questionId));
    });
  });

  return {
    version:
      typeof parsed.version === 'number' && Number.isFinite(parsed.version)
        ? parsed.version
        : isBatchHistory
          ? EXPORT_HISTORY_VERSION
          : 1,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    batches: sortBatches(batches),
    legacyQuestionKeys,
    legacyQuestionKeyCount: legacyQuestionKeys.length,
    questionKeys: [...questionKeySet].sort(),
  };
}

export function buildPersistedPayload(snapshot, updatedAt = new Date().toISOString()) {
  const normalized = normalizeExportHistoryData(
    {
      version: EXPORT_HISTORY_VERSION,
      updatedAt,
      batches: snapshot.batches,
      legacyQuestionKeys: snapshot.legacyQuestionKeys,
    },
    { strict: true }
  );

  return {
    version: EXPORT_HISTORY_VERSION,
    updatedAt: normalized.updatedAt,
    batches: normalized.batches,
    legacyQuestionKeys: normalized.legacyQuestionKeys,
  };
}

function mergeBatchEntries(current, incoming) {
  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  if (incoming.questions.length > current.questions.length) {
    return incoming;
  }

  if (!current.filename && incoming.filename) {
    return incoming;
  }

  return current;
}

export function mergeSnapshots(current, incoming) {
  const batchesById = new Map(current.batches.map((batch) => [batch.id, batch]));

  incoming.batches.forEach((batch) => {
    batchesById.set(batch.id, mergeBatchEntries(batchesById.get(batch.id), batch));
  });

  return normalizeExportHistoryData({
    version: EXPORT_HISTORY_VERSION,
    updatedAt: new Date().toISOString(),
    batches: [...batchesById.values()],
    legacyQuestionKeys: [...new Set([...current.legacyQuestionKeys, ...incoming.legacyQuestionKeys])],
  });
}

export function createBatchRecord(config, questions, metadata = {}) {
  const normalizedQuestions = questions.map((question) => normalizeQuestionEntry(question)).filter(Boolean);

  return normalizeBatchEntry(
    {
      exportedAt: metadata.exportedAt || new Date().toISOString(),
      assessment: config.assessment,
      section: config.section,
      batchNumber: metadata.batchNumber ?? null,
      filename: metadata.filename || '',
      mode: config.mode || 'student',
      includeAnswerKey: Boolean(config.includeAnswerKey),
      questionCount: normalizedQuestions.length,
      includedDomains: toSortedUniqueStrings(normalizedQuestions.map((question) => question.domain)),
      questions: normalizedQuestions,
    },
    { strict: true }
  );
}

export function serializeExportHistorySnapshot(snapshot) {
  return JSON.stringify(buildPersistedPayload(snapshot), null, 2);
}

export function filterPreviouslyExportedQuestions(config, questions, historySet) {
  return questions.filter((question) => !historySet.has(createQuestionKey(config, question)));
}
