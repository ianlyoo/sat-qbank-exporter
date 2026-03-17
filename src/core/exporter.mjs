import fs from 'node:fs/promises';
import path from 'node:path';

import {
  applyFilters,
  buildFilename,
  chunkArray,
  createActiveIdSet,
  createHeaderText,
  difficultyLabel,
  normalizeDifficultyFilters,
  normalizeExportOptions,
  normalizeLegacyAnswerOptions,
  normalizeLegacyCorrectAnswer,
  resolveLookup,
  selectQuestions,
} from './helpers.mjs';
import {
  fetchLegacyQuestionDetails,
  fetchQuestionDetails,
  fetchQuestionList,
  fetchQuestionLookup,
} from './qbank.mjs';
import { appendExportHistory, filterPreviouslyExportedQuestions, loadExportHistory } from './export-history.mjs';
import { renderPdfBatch, withBrowser } from './pdf.mjs';
import { renderDocumentHtml } from './render.mjs';

export function formatProgress(state) {
  return {
    state: state.state,
    phase: state.phase,
    message: state.message,
    matchedCount: state.matchedCount ?? null,
    exportCount: state.exportCount ?? null,
    currentBatch: state.currentBatch ?? null,
    totalBatches: state.totalBatches ?? null,
    savedFiles: state.savedFiles ?? [],
    error: state.error ?? null,
    outputDir: state.outputDir ?? null,
    config: state.config ?? null,
  };
}

function emitProgress(onProgress, patch) {
  if (typeof onProgress === 'function') {
    onProgress(patch);
  }
}

export async function prepareExport(input, { onProgress } = {}) {
  const config = normalizeExportOptions(input);
  emitProgress(onProgress, {
    state: 'running',
    phase: 'lookup',
    message: 'Loading lookup options',
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
    message: 'Fetching questions',
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

  const exportHistory = config.excludeExported ? await loadExportHistory(undefined, { strict: true }) : new Set();
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

export async function previewExport(input, { onProgress } = {}) {
  const prepared = await prepareExport(input, { onProgress });

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

export async function runExport(input, { onProgress } = {}) {
  const prepared = await prepareExport(input, { onProgress });
  const savedFiles = [];

  emitProgress(onProgress, {
    state: 'running',
    phase: 'preparing-output',
    message: 'Preparing output folder',
    matchedCount: prepared.totalMatchedCount,
    exportCount: prepared.selectedCount,
    totalBatches: prepared.exportBatchCount,
    outputDir: prepared.config.outputDir,
    config: prepared.config,
  });

  await fs.mkdir(prepared.config.outputDir, { recursive: true });

  await withBrowser(prepared.config.headed, async (browser) => {
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
        message: `Rendering PDF ${index + 1} of ${prepared.exportBatchCount}`,
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
        mode: prepared.config.mode,
        includeAnswerKey: prepared.config.includeAnswerKey,
        headerText: createHeaderText({
          assessment: prepared.config.assessment,
          section: prepared.config.section,
          domains: prepared.config.domains,
          batchNumber,
        }),
      });

      const filename = buildFilename(batchNumber, printableBatch, prepared.config.mode);
      const filePath = path.join(prepared.config.outputDir, filename);
      await renderPdfBatch(browser, html, filePath);
      await appendExportHistory(prepared.config, batch);
      savedFiles.push(filePath);

      emitProgress(onProgress, {
        state: 'running',
        phase: 'saved',
        message: `Saved ${filename}`,
        matchedCount: prepared.totalMatchedCount,
        exportCount: prepared.selectedCount,
        currentBatch: index + 1,
        totalBatches: prepared.exportBatchCount,
        savedFiles,
        outputDir: prepared.config.outputDir,
        config: prepared.config,
      });
    }
  });

  return {
    matchedCount: prepared.totalMatchedCount,
    exportCount: prepared.selectedCount,
    totalBatches: prepared.exportBatchCount,
    savedFiles,
    outputDir: prepared.config.outputDir,
    config: prepared.config,
  };
}
