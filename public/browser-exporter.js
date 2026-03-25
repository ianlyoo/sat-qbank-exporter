import { renderDocumentHtml } from './render-document.js';
import {
  DEFAULT_EXPORT_OPTIONS,
  DIFFICULTY_CODES,
  EXPORT_MODES,
} from './constants.mjs';

const LOOKUP_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/lookup';
const GET_QUESTIONS_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-questions';
const PDF_DOWNLOAD_URL =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/pdf-download';
const LEGACY_DISCLOSED_BASE_URL = 'https://saic.collegeboard.org/disclosed';

const EXPORT_HISTORY_STORAGE_KEY = 'sat-exporter-browser-history-v2';
const EXPORT_HISTORY_VERSION = 2;

let lookupCache = null;
let mobilePdfModulesPromise = null;

export function shouldPreferVisiblePreviewWindow(environment = {}) {
  const userAgent = String(environment.userAgent || '');
  const platform = String(environment.platform || '');
  const maxTouchPoints = Number(environment.maxTouchPoints || 0);
  const isTouchMac = platform === 'MacIntel' && maxTouchPoints > 1;
  const isAppleMobile = /iPhone|iPad|iPod/.test(userAgent) || isTouchMac;
  const isMobile =
    /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/.test(userAgent) || isAppleMobile;

  return isMobile;
}

function getLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Browser storage is unavailable in this environment.');
  }

  return window.localStorage;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer, got "${value}"`);
  }

  return parsed;
}

function parseList(value) {
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function shuffleArray(items) {
  const clone = [...items];

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }

  return clone;
}

function difficultyLabel(code) {
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

function normalizeDifficultyFilters(values) {
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

function applyFilters({ questions, difficultyCodes, allowedSkills, excludeActive, activeIds }) {
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

function buildFilename(batchNumber, batch, mode) {
  const firstId = batch[0].questionId;
  const lastId = batch[batch.length - 1].questionId;
  return `${String(batchNumber).padStart(3, '0')}_${firstId}-${lastId}_${slugify(mode)}.pdf`;
}

function normalizeExportOptions(input = {}) {
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
    includeAnswerKey: parseBoolean(merged.includeAnswerKey, DEFAULT_EXPORT_OPTIONS.includeAnswerKey),
    outputDir: String(merged.outputDir || DEFAULT_EXPORT_OPTIONS.outputDir).trim() || DEFAULT_EXPORT_OPTIONS.outputDir,
    excludeActive: parseBoolean(merged.excludeActive, DEFAULT_EXPORT_OPTIONS.excludeActive),
    excludeExported: parseBoolean(merged.excludeExported, DEFAULT_EXPORT_OPTIONS.excludeExported),
    shuffle: parseBoolean(merged.shuffle, DEFAULT_EXPORT_OPTIONS.shuffle),
    autoDownloadPdf: parseBoolean(merged.autoDownloadPdf, DEFAULT_EXPORT_OPTIONS.autoDownloadPdf),
    fromPage: parseInteger(merged.fromPage, DEFAULT_EXPORT_OPTIONS.fromPage),
    toPage:
      merged.toPage === null || merged.toPage === undefined || merged.toPage === ''
        ? null
        : parseInteger(merged.toPage, null),
    headed: false,
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

function selectQuestions(questions, questionCount, shuffle) {
  const chosen = shuffle ? shuffleArray(questions) : [...questions];

  if (questionCount === null || questionCount === undefined) {
    return chosen;
  }

  return chosen.slice(0, questionCount);
}

function createHeaderText({ assessment, section, domains, batchNumber }) {
  void domains;
  return `${assessment} ${section} - Batch ${batchNumber}`;
}

function createActiveIdSet(lookup, section) {
  return section === 'Math'
    ? new Set(lookup.mathLiveItems || [])
    : new Set(lookup.readingLiveItems || []);
}

function mapLookupForUi(lookupData) {
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

function resolveLookup(lookupData, assessmentLabel, sectionLabel, domainLabels, skillLabels) {
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

function normalizeLegacyAnswerOptions(answer = {}) {
  const choices = answer.choices || {};
  return Object.entries(choices).map(([letter, choice]) => ({
    letter: String(letter).toUpperCase(),
    content: choice.body || choice.content || '',
  }));
}

function normalizeLegacyCorrectAnswer(answer = {}) {
  if (answer.correct_choice) {
    return [String(answer.correct_choice).toUpperCase()];
  }

  if (answer.correct_spr?.absolute?.length) {
    return answer.correct_spr.absolute.map((item) => String(item));
  }

  return [];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}

async function fetchQuestionLookup({ force = false } = {}) {
  const now = Date.now();
  if (!force && lookupCache && now - lookupCache.fetchedAt < 5 * 60 * 1000) {
    return lookupCache.data;
  }

  const data = await fetchJson(LOOKUP_URL);
  lookupCache = {
    data,
    fetchedAt: now,
  };

  return data;
}

async function fetchQuestionList(payload) {
  return fetchJson(GET_QUESTIONS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function fetchQuestionDetails(externalIds) {
  if (!externalIds.length) {
    return [];
  }

  return fetchJson(PDF_DOWNLOAD_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      external_ids: externalIds,
    }),
  });
}

async function fetchLegacyQuestionDetail(ibn) {
  const response = await fetch(`${LEGACY_DISCLOSED_BASE_URL}/${encodeURIComponent(ibn)}.json`);
  if (!response.ok) {
    throw new Error(`Legacy question fetch failed for ${ibn}: ${response.status} ${response.statusText}`);
  }

  const items = await response.json();
  return items[0];
}

async function fetchLegacyQuestionDetails(ibns) {
  if (!ibns.length) {
    return [];
  }

  return Promise.all(ibns.map((ibn) => fetchLegacyQuestionDetail(ibn)));
}

function createQuestionKey(config, question) {
  return `${config.assessment}::${config.section}::${question.questionId}`;
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

function createEmptySnapshot() {
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

function createBatchId(entry) {
  return [
    entry.assessment,
    entry.section,
    entry.batchNumber ?? '',
    entry.filename || '',
    entry.exportedAt || '',
    entry.mode || '',
    entry.includeAnswerKey ? '1' : '0',
    ...entry.questions.map((question) => question.questionId),
  ].join('::');
}

function normalizeBatchEntry(entry, { strict = false } = {}) {
  if (!entry || typeof entry !== 'object') {
    if (strict) {
      throw new Error('The selected export-history file is invalid.');
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
      throw new Error('The selected export-history file is invalid.');
    }

    return null;
  }

  const normalized = {
    id: String(entry.id || '').trim(),
    exportedAt: typeof entry.exportedAt === 'string' ? entry.exportedAt : null,
    assessment,
    section,
    batchNumber:
      typeof entry.batchNumber === 'number' && Number.isFinite(entry.batchNumber) ? entry.batchNumber : null,
    filename: String(entry.filename || '').trim(),
    mode: String(entry.mode || 'student').trim() || 'student',
    includeAnswerKey: Boolean(entry.includeAnswerKey),
    questionCount:
      typeof entry.questionCount === 'number' && Number.isFinite(entry.questionCount)
        ? entry.questionCount
        : questions.length,
    includedDomains: toSortedUniqueStrings(
      Array.isArray(entry.includedDomains) && entry.includedDomains.length
        ? entry.includedDomains
        : questions.map((question) => question.domain)
    ),
    questions,
  };

  normalized.id = normalized.id || createBatchId(normalized);
  return normalized;
}

function normalizeHistoryData(parsed, { strict = false } = {}) {
  if (!parsed || typeof parsed !== 'object') {
    if (strict) {
      throw new Error('The selected export-history file is invalid.');
    }

    return createEmptySnapshot();
  }

  const batches = (Array.isArray(parsed.batches) ? parsed.batches : [])
    .map((entry) => normalizeBatchEntry(entry, { strict }))
    .filter(Boolean);
  const legacyQuestionKeys = Array.isArray(parsed.legacyQuestionKeys)
    ? toSortedUniqueStrings(parsed.legacyQuestionKeys)
    : Array.isArray(parsed.questionKeys)
      ? toSortedUniqueStrings(parsed.questionKeys)
      : [];
  const questionKeySet = new Set(legacyQuestionKeys);

  batches.forEach((batch) => {
    batch.questions.forEach((question) => {
      questionKeySet.add(`${batch.assessment}::${batch.section}::${question.questionId}`);
    });
  });

  return {
    version: EXPORT_HISTORY_VERSION,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    batches,
    legacyQuestionKeys,
    legacyQuestionKeyCount: legacyQuestionKeys.length,
    questionKeys: [...questionKeySet].sort(),
  };
}

function readBrowserHistorySnapshot() {
  try {
    const raw = getLocalStorage().getItem(EXPORT_HISTORY_STORAGE_KEY);
    if (!raw) {
      return createEmptySnapshot();
    }

    return normalizeHistoryData(JSON.parse(raw));
  } catch {
    return createEmptySnapshot();
  }
}

function writeBrowserHistorySnapshot(snapshot) {
  const normalized = normalizeHistoryData({
    ...snapshot,
    version: EXPORT_HISTORY_VERSION,
    updatedAt: new Date().toISOString(),
  });
  getLocalStorage().setItem(EXPORT_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function appendBrowserHistory(config, questions, metadata = {}) {
  const snapshot = readBrowserHistorySnapshot();
  const entry = normalizeBatchEntry(
    {
      exportedAt: metadata.exportedAt || new Date().toISOString(),
      assessment: config.assessment,
      section: config.section,
      batchNumber: metadata.batchNumber ?? null,
      filename: metadata.filename || '',
      mode: config.mode || 'student',
      includeAnswerKey: Boolean(config.includeAnswerKey),
      questions: questions.map((question) => normalizeQuestionEntry(question)).filter(Boolean),
    },
    { strict: true }
  );

  const batchesById = new Map(snapshot.batches.map((batch) => [batch.id, batch]));
  batchesById.set(entry.id, entry);

  return writeBrowserHistorySnapshot({
    ...snapshot,
    batches: [...batchesById.values()],
  });
}

function clearBrowserHistorySnapshot() {
  getLocalStorage().removeItem(EXPORT_HISTORY_STORAGE_KEY);
  return { ok: true };
}

function importBrowserHistorySnapshot(history) {
  const incoming = normalizeHistoryData(history, { strict: true });
  const current = readBrowserHistorySnapshot();
  const batchesById = new Map(current.batches.map((batch) => [batch.id, batch]));

  incoming.batches.forEach((batch) => {
    batchesById.set(batch.id, batch);
  });

  return writeBrowserHistorySnapshot({
    ...current,
    batches: [...batchesById.values()],
    legacyQuestionKeys: [...new Set([...current.legacyQuestionKeys, ...incoming.legacyQuestionKeys])],
  });
}

function serializeBrowserHistorySnapshot() {
  return JSON.stringify(readBrowserHistorySnapshot(), null, 2);
}

function mapBrowserHistoryPayload(history) {
  return {
    batchCount: history.batches.length,
    questionCount: history.questionKeys.length,
    legacyQuestionKeyCount: history.legacyQuestionKeyCount,
    updatedAt: history.updatedAt,
    batches: history.batches,
  };
}

function loadBrowserHistorySet() {
  return new Set(readBrowserHistorySnapshot().questionKeys);
}

function filterPreviouslyExportedQuestions(config, questions, historySet) {
  return questions.filter((question) => !historySet.has(createQuestionKey(config, question)));
}

function mapPrintableBatch(batch, detailItems, legacyItems) {
  const detailByExternalId = new Map(detailItems.map((item) => [item.externalid, item]));
  const legacyByItemId = new Map(legacyItems.map((item) => [item.item_id, item]));

  return batch.map((item) => {
    if (item.external_id) {
      const detail = detailByExternalId.get(item.external_id);
      if (!detail) {
        throw new Error(`Missing detailed content for question ${item.questionId}`);
      }

      const answerOptions = (detail.answerOptions || []).map((option, index) => ({
        letter: String.fromCharCode(65 + index),
        content: option.content,
      }));

      return {
        questionId: item.questionId,
        domain: item.primary_class_cd_desc,
        skill: item.skill_desc,
        difficultyLabel: difficultyLabel(item.difficulty),
        prompt: detail.stimulus,
        stem: detail.stem,
        answerOptions,
        correctAnswer: detail.correct_answer || [],
        rationale: detail.rationale,
      };
    }

    const legacy = legacyByItemId.get(item.ibn);
    if (!legacy) {
      throw new Error(`Missing legacy content for question ${item.questionId}`);
    }

    return {
      questionId: item.questionId,
      domain: item.primary_class_cd_desc,
      skill: item.skill_desc,
      difficultyLabel: difficultyLabel(item.difficulty),
      prompt: legacy.prompt || '',
      stem: legacy.stem || '',
      answerOptions: normalizeLegacyAnswerOptions(legacy.answer),
      correctAnswer: normalizeLegacyCorrectAnswer(legacy.answer),
      rationale: legacy.answer?.rationale || '',
    };
  });
}

function createOutputFilename(filename, outputDir) {
  const sanitizedPrefix = slugify(
    String(outputDir || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop() || 'practice-packets'
  );
  return sanitizedPrefix ? `${sanitizedPrefix}_${filename}` : filename;
}

function createHtmlFallbackFilename(filename) {
  return filename.replace(/\.pdf$/i, '.html');
}

function downloadTextFile(filename, contents) {
  const blob = new Blob([contents], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function createPreviewEntry(filename, blob, type = 'text/html') {
  return {
    delivery: 'preview',
    label: filename,
    url: URL.createObjectURL(blob),
    blob,
    type,
  };
}

function escapePreviewHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderVisiblePreviewIndex(entries, { readyCount, totalBatches }) {
  const resourceLabel =
    entries.some((entry) => entry.type === 'application/pdf') ? 'PDF' : 'preview';
  const links = entries.length
    ? entries
        .map(
          (entry, index) => `
            <li>
              <a href="${entry.url}" target="_blank" rel="noreferrer">${escapePreviewHtml(entry.label)}</a>
              <span>Batch ${index + 1}</span>
            </li>
          `
        )
        .join('')
    : '<li><span>Preparing the first batch…</span></li>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Packet previews</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        padding: 24px;
        background: #f7f3ed;
        color: #1f2f2a;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 24px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(37, 73, 66, 0.12);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 12px;
        line-height: 1.5;
      }
      ul {
        margin: 20px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 12px;
      }
      li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 14px 16px;
        border-radius: 16px;
        background: #fffaf5;
        border: 1px solid rgba(37, 73, 66, 0.12);
      }
      a {
        color: #244942;
        font-weight: 600;
        text-decoration: none;
      }
      span {
        color: #5d6663;
        font-size: 0.95rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Packet ${resourceLabel === 'PDF' ? 'PDFs' : 'previews'} are ready</h1>
      <p>Prepared ${readyCount} of ${totalBatches} batch${totalBatches === 1 ? '' : 'es'}.</p>
      <p>${
        resourceLabel === 'PDF'
          ? 'Open a batch PDF, then use Share or Save to Files on your device.'
          : 'Open a batch, then use Share or Print on your device to save it as PDF.'
      }</p>
      <ul>${links}</ul>
    </main>
  </body>
</html>`;
}

function updateVisiblePreviewWindow(previewWindow, entries, { totalBatches }) {
  if (!previewWindow || previewWindow.closed) {
    return false;
  }

  const doc = previewWindow.document;
  if (!doc) {
    return false;
  }

  doc.open();
  doc.write(
    renderVisiblePreviewIndex(entries, {
      readyCount: entries.length,
      totalBatches,
    })
  );
  doc.close();
  return true;
}

async function waitForFrameLoad(frame, url) {
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      frame.removeEventListener('load', handleLoad);
      frame.removeEventListener('error', handleError);
    };

    const handleLoad = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error('Unable to load the printable document into the browser print frame.'));
    };

    frame.addEventListener('load', handleLoad, { once: true });
    frame.addEventListener('error', handleError, { once: true });
    frame.src = url;
  });
}

async function waitForFrameLayout(frame, timeoutMs = 20_000) {
  const doneFlag = '__SAT_PDF_LAYOUT_DONE__';
  const errorFlag = '__SAT_PDF_LAYOUT_ERROR__';
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const frameWindow = frame.contentWindow;

    if (!frameWindow) {
      throw new Error('Browser print frame is unavailable.');
    }

    if (frameWindow[errorFlag]) {
      throw new Error(String(frameWindow[errorFlag]));
    }

    if (frameWindow[doneFlag]) {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  throw new Error('Timed out while preparing the printable packet.');
}

async function printWithFrame(frame) {
  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    throw new Error('Browser print frame is unavailable.');
  }

  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      frameWindow.removeEventListener('afterprint', finish);
      resolve();
    };

    frameWindow.addEventListener('afterprint', finish, { once: true });

    // Some browsers do not reliably emit afterprint for iframe content.
    window.setTimeout(finish, 1500);

    frameWindow.focus();
    frameWindow.print();
  });
}

async function openPrintablePreview(filename, contents, printFrame) {
  if (printFrame && printFrame.contentWindow) {
    const blob = new Blob([contents], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      await waitForFrameLoad(printFrame, url);
      await waitForFrameLayout(printFrame);
      await printWithFrame(printFrame);

      return {
        delivery: 'print',
        label: filename,
      };
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      printFrame.removeAttribute('src');
    }
  }

  const fallbackFilename = createHtmlFallbackFilename(filename);
  downloadTextFile(fallbackFilename, contents);
  return {
    delivery: 'download',
    label: fallbackFilename,
  };
}

async function loadMobilePdfModules() {
  if (!mobilePdfModulesPromise) {
    mobilePdfModulesPromise = Promise.all([
      import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm'),
      import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm'),
    ]).then(([html2canvasModule, jsPdfModule]) => ({
      html2canvas: html2canvasModule.default || html2canvasModule,
      jsPDF:
        jsPdfModule.jsPDF ||
        jsPdfModule.default?.jsPDF ||
        jsPdfModule.default,
    }));
  }

  return mobilePdfModulesPromise;
}

async function renderPdfPreview(filename, contents, renderFrame) {
  if (!renderFrame) {
    throw new Error('Browser render frame is unavailable.');
  }

  const { html2canvas, jsPDF } = await loadMobilePdfModules();
  const htmlBlob = new Blob([contents], { type: 'text/html;charset=utf-8' });
  const htmlUrl = URL.createObjectURL(htmlBlob);

  try {
    await waitForFrameLoad(renderFrame, htmlUrl);
    await waitForFrameLayout(renderFrame);

    const frameDocument = renderFrame.contentDocument;
    const pageNodes = Array.from(frameDocument?.querySelectorAll('.print-page') || []);

    if (!pageNodes.length) {
      throw new Error('No printable pages were rendered for PDF export.');
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let index = 0; index < pageNodes.length; index += 1) {
      const pageNode = pageNodes[index];
      const canvas = await html2canvas(pageNode, {
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        scale: 2,
        windowWidth: Math.ceil(pageNode.scrollWidth),
        windowHeight: Math.ceil(pageNode.scrollHeight),
      });
      const imageData = canvas.toDataURL('image/jpeg', 0.92);

      if (index > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }

    const pdfBlob = pdf.output('blob');
    return createPreviewEntry(filename, pdfBlob, 'application/pdf');
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 60_000);
    renderFrame.removeAttribute('src');
  }
}

function resolveBrowserRenderOptions(config) {
  if (config.mode === EXPORT_MODES.teacher) {
    return {
      mode: EXPORT_MODES.student,
      includeAnswerKey: true,
    };
  }

  return {
    mode: config.mode,
    includeAnswerKey: Boolean(config.includeAnswerKey),
  };
}

function emitProgress(onProgress, patch) {
  if (typeof onProgress === 'function') {
    onProgress(patch);
  }
}

async function prepareExport(input, { onProgress } = {}) {
  const config = normalizeExportOptions(input);
  emitProgress(onProgress, {
    state: 'running',
    phase: 'lookup',
    message: 'Loading College Board lookup options',
    config,
  });

  const lookup = await fetchQuestionLookup();
  const resolved = resolveLookup(
    lookup.lookupData,
    config.assessment,
    config.section,
    config.domains,
    config.skills
  );

  emitProgress(onProgress, {
    state: 'running',
    phase: 'list',
    message: 'Fetching matching questions',
    config,
  });

  const questions = await fetchQuestionList({
    asmtEventId: resolved.assessmentId,
    test: resolved.sectionId,
    domain: resolved.domainCodes.join(','),
  });

  const filtered = applyFilters({
    questions,
    difficultyCodes: normalizeDifficultyFilters(config.difficulty),
    allowedSkills: resolved.allowedSkills,
    excludeActive: config.excludeActive,
    activeIds: createActiveIdSet(lookup, config.section),
  });

  const exportHistory = config.excludeExported ? loadBrowserHistorySet() : new Set();
  const availableQuestions = config.excludeExported
    ? filterPreviouslyExportedQuestions(config, filtered, exportHistory)
    : filtered;

  if (!availableQuestions.length) {
    if (config.excludeExported && filtered.length) {
      throw new Error(
        'No questions remain after excluding previously exported ones. Turn off the export-history filter or widen the selection.'
      );
    }

    throw new Error('No questions matched the selected filters.');
  }

  const selectedQuestions = selectQuestions(availableQuestions, config.questionCount, config.shuffle);
  const batches = chunkArray(selectedQuestions, config.chunkSize);
  const lastPage = config.toPage ? Math.min(config.toPage, batches.length) : batches.length;

  if (config.fromPage > lastPage) {
    throw new Error(`Requested batch range ${config.fromPage}-${lastPage} is empty.`);
  }

  const exportBatches = batches.slice(config.fromPage - 1, lastPage);

  return {
    config,
    filteredQuestions: filtered,
    availableQuestions,
    selectedQuestions,
    batches,
    exportBatches,
    totalMatchedCount: filtered.length,
    availableCount: availableQuestions.length,
    excludedPreviouslyExportedCount: filtered.length - availableQuestions.length,
    exportHistoryCount: exportHistory.size,
    selectedCount: selectedQuestions.length,
    totalBatchCount: batches.length,
    exportBatchCount: exportBatches.length,
  };
}

export async function loadBrowserBootData() {
  const lookup = await fetchQuestionLookup();
  return {
    defaults: { ...DEFAULT_EXPORT_OPTIONS },
    lookup: mapLookupForUi(lookup.lookupData),
  };
}

export async function previewBrowserExport(input) {
  const prepared = await prepareExport(input);

  return {
    config: prepared.config,
    matchedCount: prepared.totalMatchedCount,
    availableCount: prepared.availableCount,
    excludedPreviouslyExportedCount: prepared.excludedPreviouslyExportedCount,
    exportHistoryCount: prepared.exportHistoryCount,
    exportCount: prepared.selectedCount,
    totalBatches: prepared.totalBatchCount,
    exportBatches: prepared.exportBatchCount,
    outputDir: prepared.config.outputDir,
  };
}

export async function runBrowserExport(
  input,
  { onProgress, printFrame = null, renderFrame = null, visiblePreviewWindow = null } = {}
) {
  const prepared = await prepareExport(input, { onProgress });
  const savedFiles = [];
  const previewEntries = [];
  let openedPreviewCount = 0;
  let fallbackDownloadCount = 0;
  const renderOptions = resolveBrowserRenderOptions(prepared.config);
  const preferVisiblePreview =
    shouldPreferVisiblePreviewWindow(typeof navigator === 'object' ? navigator : {}) && !printFrame;

  emitProgress(onProgress, {
    state: 'running',
    phase: 'preparing-output',
    message: 'Preparing printable packet previews',
    matchedCount: prepared.totalMatchedCount,
    exportCount: prepared.selectedCount,
    totalBatches: prepared.exportBatchCount,
    outputDir: prepared.config.outputDir,
    config: prepared.config,
  });

  for (let index = 0; index < prepared.exportBatches.length; index += 1) {
    const batch = prepared.exportBatches[index];
    const batchNumber = prepared.config.fromPage + index;

    emitProgress(onProgress, {
      state: 'running',
      phase: 'details',
      message: `Fetching question details for batch ${batchNumber}`,
      matchedCount: prepared.totalMatchedCount,
      exportCount: prepared.selectedCount,
      currentBatch: index + 1,
      totalBatches: prepared.exportBatchCount,
      savedFiles,
      outputDir: prepared.config.outputDir,
      config: prepared.config,
    });

    const digitalQuestions = batch.filter((item) => item.external_id);
    const legacyQuestions = batch.filter((item) => item.ibn);
    const detailItems = await fetchQuestionDetails(digitalQuestions.map((item) => item.external_id));
    const legacyItems = await fetchLegacyQuestionDetails(legacyQuestions.map((item) => item.ibn));
    const printableBatch = mapPrintableBatch(batch, detailItems, legacyItems);

    emitProgress(onProgress, {
      state: 'running',
      phase: 'rendering',
      message: `Building printable HTML ${index + 1} of ${prepared.exportBatchCount}`,
      matchedCount: prepared.totalMatchedCount,
      exportCount: prepared.selectedCount,
      currentBatch: index + 1,
      totalBatches: prepared.exportBatchCount,
      savedFiles,
      outputDir: prepared.config.outputDir,
      config: prepared.config,
    });

    const html = renderDocumentHtml({
      batch: printableBatch,
      mode: renderOptions.mode,
      includeAnswerKey: renderOptions.includeAnswerKey,
      headerText: createHeaderText({
        assessment: prepared.config.assessment,
        section: prepared.config.section,
        domains: prepared.config.domains,
        batchNumber,
      }),
    });

    const filename = createOutputFilename(
      buildFilename(batchNumber, printableBatch, prepared.config.mode),
      prepared.config.outputDir
    );
    let delivery;

    if (preferVisiblePreview && visiblePreviewWindow) {
      try {
        delivery = await renderPdfPreview(filename, html, renderFrame);
        previewEntries.push(delivery);

        if (prepared.config.autoDownloadPdf && delivery.type === 'application/pdf') {
          downloadBlobFile(delivery.label, delivery.blob);
        }

        if (prepared.exportBatchCount === 1) {
          visiblePreviewWindow.location.replace(delivery.url);
        } else {
          updateVisiblePreviewWindow(visiblePreviewWindow, previewEntries, {
            totalBatches: prepared.exportBatchCount,
          });
        }
      } catch {
        const htmlDelivery = createPreviewEntry(
          createHtmlFallbackFilename(filename),
          new Blob([html], { type: 'text/html;charset=utf-8' })
        );
        delivery = htmlDelivery;
        previewEntries.push(delivery);

        if (prepared.exportBatchCount === 1) {
          visiblePreviewWindow.location.replace(delivery.url);
        } else {
          updateVisiblePreviewWindow(visiblePreviewWindow, previewEntries, {
            totalBatches: prepared.exportBatchCount,
          });
        }
      }
    } else {
      delivery = await openPrintablePreview(filename, html, printFrame);
    }

    appendBrowserHistory(prepared.config, batch, {
      batchNumber,
      filename,
    });
    savedFiles.push(delivery.label);
    if (delivery.delivery === 'preview') {
      openedPreviewCount += 1;
    } else {
      fallbackDownloadCount += 1;
    }

    emitProgress(onProgress, {
      state: 'running',
      phase: 'saved',
      message:
        delivery.delivery === 'print'
          ? `Opened the print dialog for ${filename}. Use Save as PDF.`
          : delivery.delivery === 'preview' &&
              delivery.type === 'application/pdf' &&
              prepared.config.autoDownloadPdf
            ? `Started downloading ${delivery.label}. If your browser blocks it, use the opened PDF preview.`
          : delivery.delivery === 'preview' && delivery.type === 'application/pdf'
            ? `Opened ${delivery.label} as a PDF preview. Use Share or Save to Files.`
          : delivery.delivery === 'preview'
            ? `Opened ${delivery.label} in a preview tab. Use Share or Print to save it as PDF.`
          : `Popup blocked, so ${delivery.label} was downloaded instead.`,
      matchedCount: prepared.totalMatchedCount,
      exportCount: prepared.selectedCount,
      currentBatch: index + 1,
      totalBatches: prepared.exportBatchCount,
      savedFiles,
      outputDir: 'Browser print dialog',
      config: prepared.config,
    });
  }

  return {
    matchedCount: prepared.totalMatchedCount,
    exportCount: prepared.selectedCount,
    totalBatches: prepared.exportBatchCount,
    savedFiles,
    openedPreviewCount,
    fallbackDownloadCount,
    outputDir: 'Browser print dialog',
    config: prepared.config,
  };
}

export async function clearBrowserHistory() {
  return clearBrowserHistorySnapshot();
}

export async function loadBrowserHistory() {
  return mapBrowserHistoryPayload(readBrowserHistorySnapshot());
}

export async function importBrowserHistory(history) {
  return mapBrowserHistoryPayload(importBrowserHistorySnapshot(history));
}

export function downloadBrowserHistory() {
  const contents = serializeBrowserHistorySnapshot();
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sat-export-history.json';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function __testResolveBrowserRenderOptions(config) {
  return resolveBrowserRenderOptions(config);
}

export function __testMapBrowserHistoryPayload(history) {
  return mapBrowserHistoryPayload(history);
}

export function __testShouldPreferVisiblePreviewWindow(environment) {
  return shouldPreferVisiblePreviewWindow(environment);
}
