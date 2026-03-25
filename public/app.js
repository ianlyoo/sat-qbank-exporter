import {
  clearBrowserHistory,
  downloadBrowserHistory,
  importBrowserHistory,
  loadBrowserBootData,
  loadBrowserHistory,
  previewBrowserExport,
  runBrowserExport,
  shouldPreferVisiblePreviewWindow,
} from './browser-exporter.js';

const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard'];
const ACTIVE_JOB_STORAGE_KEY = 'sat-exporter-active-job-id';
const MODE_LABELS = {
  student: 'Default',
  teacher: 'Default + Key',
  clean: 'Clean',
};

const state = {
  defaults: null,
  lookup: null,
  runtimeMode: 'detecting',
  preview: null,
  previewStale: false,
  job: null,
  jobId: '',
  error: '',
  pending: {
    boot: true,
    preview: false,
    export: false,
    clearHistory: false,
    history: false,
    importHistory: false,
  },
  pollTimer: null,
  sessionStorageAvailable: true,
  clearHistoryConfirm: false,
  history: {
    open: false,
    loaded: false,
    batches: [],
    updatedAt: null,
    questionCount: 0,
    legacyQuestionKeyCount: 0,
    error: '',
    lastFocusedElement: null,
  },
  form: {
    assessment: '',
    section: '',
    domains: [],
    skills: [],
    difficulty: [],
    questionCount: 20,
    chunkSize: 20,
    mode: 'student',
    includeAnswerKey: false,
    outputDir: './output',
    shuffle: true,
    excludeExported: false,
  },
};

const dom = {};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    bindEvents();
    render();
    boot();
  });
}

function cacheDom() {
  dom.errorBanner = document.getElementById('error-banner');
  dom.reloadButton = document.getElementById('reload-button');
  dom.dataStatus = document.getElementById('data-status');
  dom.form = document.getElementById('config-form');
  dom.assessment = document.getElementById('assessment');
  dom.section = document.getElementById('section');
  dom.domainsChips = document.getElementById('domains-chips');
  dom.skillsChips = document.getElementById('skills-chips');
  dom.difficultyChips = document.getElementById('difficulty-chips');
  dom.domainsSelectAll = document.getElementById('domains-select-all');
  dom.skillsSelectAll = document.getElementById('skills-select-all');
  dom.difficultySelectAll = document.getElementById('difficulty-select-all');
  dom.domainCount = document.getElementById('domain-count');
  dom.skillCount = document.getElementById('skill-count');
  dom.difficultyCount = document.getElementById('difficulty-count');
  dom.questionCount = document.getElementById('question-count');
  dom.chunkSize = document.getElementById('chunk-size');
  dom.includeAnswerKey = document.getElementById('include-answer-key');
  dom.shuffle = document.getElementById('shuffle');
  dom.excludeExported = document.getElementById('exclude-exported');
  dom.previewButton = document.getElementById('preview-button');
  dom.exportButton = document.getElementById('export-button');
  dom.clearHistoryButton = document.getElementById('clear-history-button');
  dom.exportHistoryTrigger = document.getElementById('export-history-trigger');
  dom.exportHistoryModal = document.getElementById('export-history-modal');
  dom.exportHistoryClose = document.getElementById('export-history-close');
  dom.exportHistoryCount = document.getElementById('export-history-count');
  dom.exportHistoryQuestionCount = document.getElementById('export-history-question-count');
  dom.exportHistoryUpdated = document.getElementById('export-history-updated');
  dom.exportHistoryStatus = document.getElementById('export-history-status');
  dom.exportHistoryFeedback = document.getElementById('export-history-feedback');
  dom.exportHistoryList = document.getElementById('export-history-list');
  dom.exportHistoryDownload = document.getElementById('export-history-download');
  dom.exportHistoryImport = document.getElementById('export-history-import');
  dom.exportHistoryImportInput = document.getElementById('export-history-import-input');
  dom.previewState = document.getElementById('preview-state');
  dom.previewMatched = document.getElementById('preview-matched');
  dom.previewExportCount = document.getElementById('preview-export-count');
  dom.previewTotalBatches = document.getElementById('preview-total-batches');
  dom.previewExportBatches = document.getElementById('preview-export-batches');
  dom.previewAssessment = document.getElementById('preview-assessment');
  dom.previewSection = document.getElementById('preview-section');
  dom.previewMode = document.getElementById('preview-mode');
  dom.previewAvailable = document.getElementById('preview-available');
  dom.previewSkipped = document.getElementById('preview-skipped');
  dom.previewDomains = document.getElementById('preview-domains');
  dom.previewSkills = document.getElementById('preview-skills');
  dom.previewDifficulty = document.getElementById('preview-difficulty');
  dom.jobState = document.getElementById('job-state');
  dom.jobPhase = document.getElementById('job-phase');
  dom.jobPercent = document.getElementById('job-percent');
  dom.jobProgress = document.getElementById('job-progress');
  dom.jobMessage = document.getElementById('job-message');
  dom.jobNote = document.getElementById('job-note');
  dom.jobId = document.getElementById('job-id');
  dom.jobBatch = document.getElementById('job-batch');
  dom.jobSavedCount = document.getElementById('job-saved-count');
  dom.jobOutput = document.getElementById('job-output');
  dom.savedFiles = document.getElementById('saved-files');
}

function bindEvents() {
  dom.reloadButton.addEventListener('click', () => {
    boot();
  });

  dom.assessment.addEventListener('change', (event) => {
    updateForm({ assessment: event.target.value });
  });

  dom.section.addEventListener('change', (event) => {
    updateForm({ section: event.target.value }, { autoChooseDomain: true });
  });

  dom.questionCount.addEventListener('input', (event) => {
    updateForm({ questionCount: Number(event.target.value) || '' });
  });

  dom.chunkSize.addEventListener('input', (event) => {
    updateForm({ chunkSize: Number(event.target.value) || '' });
  });

  dom.shuffle.addEventListener('change', (event) => {
    updateForm({ shuffle: event.target.checked });
  });

  dom.excludeExported.addEventListener('change', (event) => {
    updateForm({ excludeExported: event.target.checked });
  });

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        updateForm({ mode: event.target.value });
      }
    });
  });

  dom.includeAnswerKey.addEventListener('change', (event) => {
    updateForm({ includeAnswerKey: event.target.checked });
  });

  dom.previewButton.addEventListener('click', async () => {
    if (!validateForm()) {
      return;
    }
    await requestPreview();
  });

  dom.exportButton.addEventListener('click', async () => {
    if (!validateForm()) {
      return;
    }
    await startExport();
  });

  dom.clearHistoryButton.addEventListener('click', async () => {
    await handleClearHistoryClick();
  });

  dom.exportHistoryDownload.addEventListener('click', () => {
    downloadExportHistory();
  });

  dom.exportHistoryImport.addEventListener('click', () => {
    dom.exportHistoryImportInput?.click();
  });

  dom.exportHistoryImportInput.addEventListener('change', async (event) => {
    await handleImportHistoryChange(event);
  });

  dom.exportHistoryTrigger.addEventListener('click', async () => {
    await openHistoryModal();
  });

  dom.exportHistoryClose.addEventListener('click', () => {
    closeHistoryModal();
  });

  dom.exportHistoryModal.addEventListener('click', (event) => {
    if (event.target === dom.exportHistoryModal) {
      closeHistoryModal();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!state.clearHistoryConfirm) {
      return;
    }

    if (dom.clearHistoryButton.contains(event.target)) {
      return;
    }

    state.clearHistoryConfirm = false;
    renderActions();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.history.open) {
      event.preventDefault();
      closeHistoryModal();
    }
  });

  dom.domainsSelectAll.addEventListener('click', () => {
    const domains = getDomainsForSection(state.form.section).map((domain) => domain.label);
    if (!domains.length) {
      return;
    }

    const nextDomains = state.form.domains.length >= domains.length ? [] : domains;
    updateForm({ domains: nextDomains, skills: [] }, { autoChooseDomain: false });
  });

  dom.skillsSelectAll.addEventListener('click', () => {
    const skills = getSkillsForDomains(state.form.section, state.form.domains);
    if (!skills.length) {
      return;
    }

    updateForm({ skills: state.form.skills.length >= skills.length ? [] : skills });
  });

  dom.difficultySelectAll.addEventListener('click', () => {
    if (!DIFFICULTY_OPTIONS.length) {
      return;
    }

    updateForm({
      difficulty: state.form.difficulty.length >= DIFFICULTY_OPTIONS.length ? [] : [...DIFFICULTY_OPTIONS],
    });
  });
}

function prepareBrowserPrintFrame() {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  document.body.append(frame);
  return frame;
}

function openVisiblePreviewWindow() {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    return null;
  }

  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    return null;
  }

  previewWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Preparing packet preview</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f3ed;
        color: #1f2f2a;
      }
    </style>
  </head>
  <body>
    <p>Preparing your packet preview…</p>
  </body>
</html>`);
  previewWindow.document.close();
  return previewWindow;
}

function cleanupBrowserPrintFrame(frame) {
  frame?.remove();
}

async function boot() {
  clearError();
  stopPolling();
  state.pending.boot = true;
  state.runtimeMode = 'detecting';
  render();

  try {
    let apiRuntimeAvailable = false;

    try {
      const defaultsResponse = await fetchJson('/api/defaults');
      const lookupResponse = await fetchJson('/api/lookup');
      state.defaults = defaultsResponse.defaults;
      state.lookup = lookupResponse.lookup;
      apiRuntimeAvailable = true;
    } catch {
      const browserBootData = await loadBrowserBootData();
      state.defaults = browserBootData.defaults;
      state.lookup = browserBootData.lookup;
    }

    state.runtimeMode = apiRuntimeAvailable ? 'api' : 'browser';
    const persistedJobId = apiRuntimeAvailable ? readActiveJobId() : '';
    state.form = createFormFromDefaults(state.defaults, state.lookup);
    state.preview = null;
    state.previewStale = false;
    state.job = null;
    state.jobId = persistedJobId || '';
    render();

    if (state.jobId) {
      await pollStatus();
    } else if (isPreviewComparable(state.form)) {
      await requestPreview({ quietError: true });
    }
  } catch (error) {
    state.runtimeMode = 'browser';
    setError(error.message || 'Unable to load local SAT exporter data.');
  } finally {
    state.pending.boot = false;
    render();
  }
}

function createFormFromDefaults(defaults, lookup) {
  const assessments = lookup?.assessments || [];
  const sections = lookup?.sections || [];
  const assessment = assessments.includes(defaults?.assessment) ? defaults.assessment : assessments[0] || '';
  const section = sections.includes(defaults?.section) ? defaults.section : sections[0] || '';

  return sanitizeForm(
    {
      assessment,
      section,
      domains: Array.isArray(defaults?.domains) ? [...defaults.domains] : [],
      skills: Array.isArray(defaults?.skills) ? [...defaults.skills] : [],
      difficulty: Array.isArray(defaults?.difficulty) ? [...defaults.difficulty] : [],
      questionCount: defaults?.questionCount ?? 20,
      chunkSize: defaults?.chunkSize ?? 20,
      mode: defaults?.mode || 'student',
      includeAnswerKey: Boolean(defaults?.includeAnswerKey),
      outputDir: defaults?.outputDir || './output',
      shuffle: Boolean(defaults?.shuffle ?? true),
      excludeExported: Boolean(defaults?.excludeExported ?? false),
    },
    { autoChooseDomain: true }
  );
}

function sanitizeForm(form, options = {}) {
  const next = {
    ...state.form,
    ...form,
    domains: Array.isArray(form.domains) ? [...form.domains] : [...(state.form.domains || [])],
    skills: Array.isArray(form.skills) ? [...form.skills] : [...(state.form.skills || [])],
    difficulty: Array.isArray(form.difficulty)
      ? [...form.difficulty]
      : [...(state.form.difficulty || [])],
  };

  const sectionDomains = getDomainsForSection(next.section);
  const validDomainLabels = new Set(sectionDomains.map((domain) => domain.label));
  next.domains = next.domains.filter((domain) => validDomainLabels.has(domain));

  if (options.autoChooseDomain && !next.domains.length && sectionDomains[0]) {
    next.domains = [sectionDomains[0].label];
  }

  const validSkills = new Set(getSkillsForDomains(next.section, next.domains));
  next.skills = next.skills.filter((skill) => validSkills.has(skill));
  next.difficulty = next.difficulty.filter((item) => DIFFICULTY_OPTIONS.includes(item));

  return next;
}

function updateForm(patch, options = {}) {
  state.form = sanitizeForm({ ...state.form, ...patch }, options);
  state.clearHistoryConfirm = false;
  if (state.preview) {
    state.previewStale = isPreviewComparable(state.form) && !doesPreviewMatchForm(state.preview, state.form);
  }
  clearError();
  render();
}

function isPreviewComparable(form) {
  return Boolean(form.domains?.length && form.skills?.length && form.difficulty?.length);
}

function normalizeComparisonValue(value) {
  if (Array.isArray(value)) {
    return [...value].sort();
  }

  return value;
}

function doesPreviewMatchForm(preview, form) {
  if (!preview?.config) {
    return false;
  }

  const fields = [
    'assessment',
    'section',
    'domains',
    'skills',
    'difficulty',
    'questionCount',
    'chunkSize',
    'mode',
    'includeAnswerKey',
    'outputDir',
    'shuffle',
    'excludeExported',
  ];

  return fields.every((field) => {
    const previewValue = normalizeComparisonValue(preview.config[field]);
    const formValue = normalizeComparisonValue(form[field]);
    return JSON.stringify(previewValue) === JSON.stringify(formValue);
  });
}

export function __testDoesPreviewMatchForm(preview, form) {
  return doesPreviewMatchForm(preview, form);
}

export function __testIsPreviewComparable(form) {
  return isPreviewComparable(form);
}

export function __testFormatHistoryUpdatedAt(value) {
  return formatHistoryUpdatedAt(value);
}

function getDomainsForSection(section) {
  return state.lookup?.domainsBySection?.[section] || [];
}

function getSkillsForDomains(section, domainLabels) {
  const activeDomains = getDomainsForSection(section).filter((domain) => domainLabels.includes(domain.label));
  return [...new Set(activeDomains.flatMap((domain) => domain.skills || []))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function validateForm() {
  clearError();

  if (!dom.form.reportValidity()) {
    return false;
  }

  if (!state.form.domains.length) {
    setError('Select at least one domain before previewing or exporting.');
    return false;
  }

  if (!state.form.skills.length) {
    setError('Select at least one skill before previewing or exporting.');
    return false;
  }

  if (!state.form.difficulty.length) {
    setError('Select at least one difficulty level before previewing or exporting.');
    return false;
  }

  return true;
}

async function requestPreview(options = {}) {
  if (!isPreviewComparable(state.form)) {
    state.preview = null;
    state.previewStale = false;
    render();
    return;
  }

  clearError();
  state.pending.preview = true;
  render();

  try {
    if (state.runtimeMode === 'browser') {
      state.preview = await previewBrowserExport(buildPayload());
    } else {
      const response = await fetchJson('/api/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildPayload()),
      });

      state.preview = response.preview;
    }
    state.previewStale = false;
  } catch (error) {
    if (!options.quietError) {
      setError(error.message || 'Unable to preview this export.');
    }
  } finally {
    state.pending.preview = false;
    render();
  }
}

async function startExport() {
  clearError();

  if (hasActiveJob()) {
    setError('An export is already running. Wait for it to finish before starting a new one.');
    return;
  }

  if (state.previewStale || !state.preview) {
    await requestPreview();
    if (state.previewStale || !state.preview || state.error) {
      return;
    }
  }

  stopPolling();
  state.pending.export = true;
  render();

  try {
    if (state.runtimeMode === 'browser') {
      state.jobId = '';
      clearActiveJobId();
      const useVisiblePreviewWindow = shouldPreferVisiblePreviewWindow(
        typeof navigator === 'object' ? navigator : {}
      );
      const visiblePreviewWindow = useVisiblePreviewWindow ? openVisiblePreviewWindow() : null;
      state.job = {
        state: 'running',
        phase: 'queued',
        message: useVisiblePreviewWindow
          ? 'Preparing mobile PDF previews…'
          : 'Preparing browser print previews…',
        currentBatch: null,
        totalBatches: state.preview?.exportBatches ?? null,
        savedFiles: [],
        outputDir: useVisiblePreviewWindow ? 'Preview tab' : 'Browser print dialog',
        error: null,
      };
      render();
      const browserFrame = prepareBrowserPrintFrame();
      const printFrame = useVisiblePreviewWindow ? null : browserFrame;

      try {
        const result = await runBrowserExport(buildPayload(), {
          printFrame,
          renderFrame: browserFrame,
          visiblePreviewWindow,
          onProgress(progress) {
            state.job = {
              ...state.job,
              ...progress,
            };
            render();
          },
        });

        state.job = {
          state: 'completed',
          phase: 'completed',
          message:
            result.openedPreviewCount > 0
              ? 'Opened generated batch PDFs in preview tabs. Use Share or Save to Files there.'
              : result.fallbackDownloadCount > 0
              ? 'The browser could not open the print dialog for some batches, so HTML files were downloaded instead.'
              : 'The print dialog is ready. Use Save as PDF to keep each packet.',
          currentBatch: result.totalBatches,
          totalBatches: result.totalBatches,
          savedFiles: result.savedFiles,
          outputDir: result.openedPreviewCount > 0 ? 'Preview tab' : result.outputDir,
          error: null,
        };
        state.previewStale = false;
        render();
        return;
      } finally {
        cleanupBrowserPrintFrame(browserFrame);
      }
    }

    const response = await fetchJson('/api/export', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildPayload()),
    });

    state.jobId = response.jobId;
    writeActiveJobId(state.jobId);
    state.job = {
      state: 'queued',
      phase: 'queued',
      message: 'Export queued',
      currentBatch: null,
      totalBatches: state.preview?.exportBatches ?? null,
      savedFiles: [],
      outputDir: state.preview?.outputDir || state.form.outputDir,
      error: null,
    };
    state.previewStale = false;
    render();
    await pollStatus();
  } catch (error) {
    if (error.jobId) {
      state.jobId = error.jobId;
      writeActiveJobId(state.jobId);
      await pollStatus();
    }
    setError(error.message || 'Unable to start the export job.');
  } finally {
    state.pending.export = false;
    render();
  }
}

async function handleClearHistoryClick() {
  clearError();

  if (!state.clearHistoryConfirm) {
    state.clearHistoryConfirm = true;
    renderActions();
    return;
  }

  state.clearHistoryConfirm = false;
  state.pending.clearHistory = true;
  renderActions();

  try {
    if (state.runtimeMode === 'browser') {
      await clearBrowserHistory();
    } else {
      await fetchJson('/api/export-history/clear', {
        method: 'POST',
      });
    }

    state.history.loaded = true;
    state.history.batches = [];
    state.history.updatedAt = null;
    state.history.questionCount = 0;
    state.history.legacyQuestionKeyCount = 0;
    state.history.error = '';
    renderModal();
    await syncPreviewAfterHistoryMutation();
  } catch (error) {
    setError(error.message || 'Unable to clear the local export history.');
  } finally {
    state.pending.clearHistory = false;
    renderActions();
  }
}

async function handleImportHistoryChange(event) {
  const [file] = event.target.files || [];
  event.target.value = '';

  if (!file) {
    return;
  }

  clearError();
  state.pending.importHistory = true;
  renderActions();
  renderModal();

  try {
    const contents = await file.text();
    const parsed = JSON.parse(contents);
    if (state.runtimeMode === 'browser') {
      const history = await importBrowserHistory(parsed);
      applyHistoryResponse(history);
    } else {
      const response = await fetchJson('/api/export-history/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ history: parsed }),
      });

      applyHistoryResponse(response.history);
    }
    renderModal();
    await syncPreviewAfterHistoryMutation();
  } catch (error) {
    setError(error.message || 'Unable to add the selected export history file.');
  } finally {
    state.pending.importHistory = false;
    renderActions();
    renderModal();
  }
}

function downloadExportHistory() {
  if (state.runtimeMode === 'browser') {
    downloadBrowserHistory();
    return;
  }

  const link = document.createElement('a');
  link.href = '/api/export-history/download';
  link.download = 'sat-export-history.json';
  document.body.append(link);
  link.click();
  link.remove();
}

async function syncPreviewAfterHistoryMutation() {
  if (isPreviewComparable(state.form)) {
    await requestPreview({ quietError: true });
    return;
  }

  state.preview = null;
  state.previewStale = false;
  render();
}

async function openHistoryModal() {
  if (!state.history.open) {
    state.history.open = true;
    state.history.lastFocusedElement =
      typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  renderModal();

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      if (!state.history.open) {
        return;
      }

      dom.exportHistoryClose?.focus();
    });
  }

  await loadExportHistory();
}

function closeHistoryModal() {
  if (!state.history.open) {
    return;
  }

  state.history.open = false;
  renderModal();

  const focusTarget = state.history.lastFocusedElement || dom.exportHistoryTrigger;
  state.history.lastFocusedElement = null;
  focusTarget?.focus?.();
}

async function loadExportHistory() {
  state.pending.history = true;
  state.history.error = '';
  renderModal();

  try {
    if (state.runtimeMode === 'browser') {
      const history = await loadBrowserHistory();
      applyHistoryResponse(history);
    } else {
      const response = await fetchJson('/api/export-history');
      applyHistoryResponse(response.history);
    }
  } catch (error) {
    state.history.loaded = true;
    state.history.batches = [];
    state.history.updatedAt = null;
    state.history.questionCount = 0;
    state.history.legacyQuestionKeyCount = 0;
    state.history.error = error.message || 'Unable to load the local export history.';
  } finally {
    state.pending.history = false;
    renderModal();
  }
}

function applyHistoryResponse(history) {
  state.history.loaded = true;
  state.history.batches = Array.isArray(history?.batches) ? history.batches : [];
  state.history.updatedAt = history?.updatedAt || null;
  state.history.questionCount = Number(history?.questionCount) || 0;
  state.history.legacyQuestionKeyCount = Number(history?.legacyQuestionKeyCount) || 0;
  state.history.error = '';
}

async function pollStatus() {
  if (state.runtimeMode === 'browser') {
    return;
  }

  if (!state.jobId) {
    return;
  }

  try {
    const response = await fetchJson(`/api/status/${encodeURIComponent(state.jobId)}`);
    state.job = response.job;
    if (!state.job) {
      clearActiveJobId();
      state.jobId = '';
      render();
      return;
    }
    render();

    if (state.job.state === 'completed' || state.job.state === 'failed') {
      clearActiveJobId();
      if (state.job.state === 'failed' && state.job.error) {
        setError(state.job.error);
      }
      stopPolling();
      return;
    }

    state.pollTimer = window.setTimeout(() => {
      pollStatus();
    }, 1200);
  } catch (error) {
    setError(error.message || 'Unable to refresh export status.');
    stopPolling();
  }
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function buildPayload() {
  return {
    assessment: state.form.assessment,
    section: state.form.section,
    domains: state.form.domains,
    skills: state.form.skills,
    difficulty: state.form.difficulty,
    questionCount: Number(state.form.questionCount),
    chunkSize: Number(state.form.chunkSize),
    mode: state.form.mode,
    includeAnswerKey: state.form.includeAnswerKey,
    outputDir: state.form.outputDir,
    shuffle: state.form.shuffle,
    excludeActive: false,
    excludeExported: state.form.excludeExported,
  };
}

function hasActiveJob() {
  return Boolean(state.job && state.job.state !== 'completed' && state.job.state !== 'failed');
}

function readActiveJobId() {
  try {
    return window.sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY) || '';
  } catch {
    state.sessionStorageAvailable = false;
    return '';
  }
}

function writeActiveJobId(jobId) {
  try {
    window.sessionStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
  } catch {
    state.sessionStorageAvailable = false;
  }
}

function clearActiveJobId() {
  try {
    window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
  } catch {
    state.sessionStorageAvailable = false;
  }
}

function render() {
  renderError();
  renderDataStatus();
  renderSelects();
  renderChips();
  renderInputs();
  renderActions();
  renderModal();
  renderPreview();
  renderJob();
}

function renderError() {
  if (!state.error) {
    dom.errorBanner.textContent = '';
    dom.errorBanner.classList.add('hidden');
    return;
  }

  dom.errorBanner.textContent = state.error;
  dom.errorBanner.classList.remove('hidden');
}

function renderDataStatus() {
  if (state.pending.boot) {
    dom.dataStatus.textContent = 'Loading SAT exporter data...';
    return;
  }

  if (!state.lookup) {
    dom.dataStatus.textContent = 'Lookup data is unavailable.';
    return;
  }

  const domainCount = getDomainsForSection(state.form.section).length;
  const runtimeLabel =
    state.runtimeMode === 'browser'
      ? 'Browser-only mode with direct College Board fetches.'
      : 'Local API mode.';
  dom.dataStatus.textContent = `${runtimeLabel} ${state.lookup.assessments.length} assessment${state.lookup.assessments.length === 1 ? '' : 's'}, ${state.lookup.sections.length} section${state.lookup.sections.length === 1 ? '' : 's'}, ${domainCount} domains in view.`;
}

function renderSelects() {
  updateSelectOptions(dom.assessment, state.lookup?.assessments || [], state.form.assessment);
  updateSelectOptions(dom.section, state.lookup?.sections || [], state.form.section);
}

function updateSelectOptions(select, values, selectedValue) {
  const currentValues = Array.from(select.options).map((option) => option.value);
  const changed = currentValues.length !== values.length || currentValues.some((value, index) => value !== values[index]);

  if (changed) {
    select.replaceChildren();
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  select.value = selectedValue || '';
  select.disabled = state.pending.boot || !values.length;
}

function renderChips() {
  const domainOptions = getDomainsForSection(state.form.section).map((domain) => domain.label);
  const skillOptions = getSkillsForDomains(state.form.section, state.form.domains);

  renderChipSet(dom.domainsChips, domainOptions, state.form.domains, {
    emptyMessage: 'No domains available for this section.',
    onToggle: (value) => {
      const domains = toggleValue(state.form.domains, value);
      updateForm({ domains, skills: state.form.skills }, { autoChooseDomain: false });
    },
  });

  renderChipSet(dom.skillsChips, skillOptions, state.form.skills, {
    emptyMessage: state.form.domains.length
      ? 'No skills returned for the selected domains.'
      : 'Select one or more domains to narrow by skill.',
    disabled: !state.form.domains.length,
    onToggle: (value) => {
      const skills = toggleValue(state.form.skills, value);
      updateForm({ skills });
    },
  });

  renderChipSet(dom.difficultyChips, DIFFICULTY_OPTIONS, state.form.difficulty, {
    emptyMessage: 'Difficulty filters are unavailable.',
    onToggle: (value) => {
      const difficulty = toggleValue(state.form.difficulty, value);
      updateForm({ difficulty });
    },
  });

  updateSelectAllButton(dom.domainsSelectAll, domainOptions, state.form.domains);
  updateSelectAllButton(dom.skillsSelectAll, skillOptions, state.form.skills, !state.form.domains.length);
  updateSelectAllButton(dom.difficultySelectAll, DIFFICULTY_OPTIONS, state.form.difficulty);

  dom.domainCount.textContent = `${state.form.domains.length} selected`;
  dom.skillCount.textContent = `${state.form.skills.length} selected`;
  dom.difficultyCount.textContent = `${state.form.difficulty.length} selected`;
}

function renderChipSet(container, options, selectedValues, config) {
  container.replaceChildren();

  if (!options.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-chip-state';
    empty.textContent = config.emptyMessage;
    container.append(empty);
    return;
  }

  options.forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = value;
    button.disabled = Boolean(config.disabled) || state.pending.boot;
    button.setAttribute('aria-pressed', selectedValues.includes(value) ? 'true' : 'false');

    if (selectedValues.includes(value)) {
      button.classList.add('chip-selected');
    }

    button.addEventListener('click', () => {
      config.onToggle(value);
    });

    container.append(button);
  });
}

function updateSelectAllButton(button, options, selectedValues, disabled = false) {
  const fullySelected = options.length > 0 && selectedValues.length >= options.length;
  button.disabled = Boolean(disabled) || state.pending.boot || !options.length;
  button.textContent = fullySelected ? 'Clear all' : 'Select all';
}

function toggleValue(values, value) {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  return [...values, value];
}

function renderInputs() {
  dom.questionCount.value = state.form.questionCount;
  dom.chunkSize.value = state.form.chunkSize;
  dom.includeAnswerKey.checked = state.form.includeAnswerKey;
  dom.shuffle.checked = state.form.shuffle;
  dom.excludeExported.checked = state.form.excludeExported;

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.checked = input.value === state.form.mode;
  });

  const disabled = state.pending.boot;
  dom.questionCount.disabled = disabled;
  dom.chunkSize.disabled = disabled;
  dom.includeAnswerKey.disabled = disabled;
  dom.shuffle.disabled = disabled;
  dom.excludeExported.disabled = disabled;
  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.disabled = disabled;
  });
}

function renderActions() {
  const busy =
    state.pending.boot ||
    state.pending.preview ||
    state.pending.export ||
    state.pending.clearHistory ||
    state.pending.importHistory;
  const exportLocked = hasActiveJob();

  dom.reloadButton.disabled = busy;
  dom.clearHistoryButton.disabled = busy;
  dom.exportHistoryDownload.disabled = state.pending.history || state.pending.importHistory;
  dom.exportHistoryImport.disabled = busy;
  dom.exportHistoryImportInput.disabled = busy;
  dom.exportHistoryTrigger.disabled = state.pending.boot;
  dom.previewButton.disabled = busy || !state.lookup;
  dom.exportButton.disabled = busy || !state.lookup || exportLocked;
  dom.exportHistoryTrigger.setAttribute('aria-expanded', state.history.open ? 'true' : 'false');
  dom.clearHistoryButton.textContent = state.pending.clearHistory
    ? 'Clearing...'
    : state.clearHistoryConfirm
      ? 'Are You Sure?'
      : 'Clear export history';
  dom.clearHistoryButton.className = `button button-compact ${
    state.clearHistoryConfirm
      ? 'button-danger button-clear-history button-clear-history-confirm'
      : 'button-secondary button-clear-history'
  }`;
  dom.previewButton.textContent = state.pending.preview ? 'Previewing...' : 'Preview export';
  dom.exportButton.textContent = exportLocked
    ? 'Export in progress'
    : state.pending.export
      ? state.runtimeMode === 'browser'
        ? 'Opening print dialog...'
        : 'Starting export...'
      : state.runtimeMode === 'browser'
        ? 'Start export'
        : 'Start export';
}

function renderModal() {
  const isOpen = state.history.open;
  document.body.classList.toggle('modal-open', isOpen);
  dom.exportHistoryModal.classList.toggle('hidden', !isOpen);
  dom.exportHistoryModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  dom.exportHistoryTrigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  dom.exportHistoryCount.textContent = `${state.history.batches.length.toLocaleString()} batches`;
  dom.exportHistoryQuestionCount.textContent = `${state.history.questionCount.toLocaleString()} questions`;
  dom.exportHistoryUpdated.textContent = formatHistoryUpdatedAt(state.history.updatedAt);

  if (!isOpen) {
    return;
  }

  const isLoading = state.pending.history;
  const hasError = Boolean(state.history.error);
  const hasBatches = state.history.batches.length > 0;
  const hasLegacyOnly = !hasBatches && state.history.legacyQuestionKeyCount > 0;
  const isEmpty = state.history.loaded && !hasError && !hasBatches && !hasLegacyOnly;

  dom.exportHistoryStatus.textContent = getHistoryStatusMessage({
    isLoading,
    hasError,
    isEmpty,
    batchCount: state.history.batches.length,
    questionCount: state.history.questionCount,
    legacyQuestionKeyCount: state.history.legacyQuestionKeyCount,
  });

  if (hasError) {
    renderHistoryFeedback(state.history.error, 'history-feedback history-feedback-error');
    renderHistoryEntries([]);
    dom.exportHistoryList.classList.add('hidden');
    return;
  }

  if (isLoading && !hasBatches) {
    renderHistoryFeedback('Loading local export history…', 'history-feedback');
    renderHistoryEntries([]);
    dom.exportHistoryList.classList.add('hidden');
    return;
  }

  if (hasLegacyOnly) {
    renderHistoryFeedback(
      `${state.history.legacyQuestionKeyCount.toLocaleString()} older question-level entries are active for duplicate filtering. New exports will appear here as saved batches.`,
      'history-feedback history-feedback-empty'
    );
    renderHistoryEntries([]);
    dom.exportHistoryList.classList.add('hidden');
    return;
  }

  if (isEmpty) {
    renderHistoryFeedback(
      'No batch history has been saved yet. Run an export first to start building this cache.',
      'history-feedback history-feedback-empty'
    );
    renderHistoryEntries([]);
    dom.exportHistoryList.classList.add('hidden');
    return;
  }

  renderHistoryFeedback('', 'history-feedback hidden');
  dom.exportHistoryList.classList.remove('hidden');
  renderHistoryEntries(state.history.batches);
}

function renderPreview() {
  const preview = state.preview;
  const previewConfig = preview?.config || state.form;

  if (!preview) {
    dom.previewState.textContent = state.pending.preview ? 'Loading' : 'Waiting';
    dom.previewState.className = 'state-pill';
    dom.previewMatched.textContent = '--';
    dom.previewExportCount.textContent = '--';
    dom.previewTotalBatches.textContent = '--';
    dom.previewExportBatches.textContent = '--';
    dom.previewAssessment.textContent = state.form.assessment || '--';
    dom.previewSection.textContent = state.form.section || '--';
    dom.previewMode.textContent = formatMode(state.form.mode, state.form.includeAnswerKey);
    dom.previewAvailable.textContent = state.form.excludeExported ? '--' : 'All matched questions';
    dom.previewSkipped.textContent = state.form.excludeExported ? '--' : 'Filter off';
    renderSummaryChips(dom.previewDomains, state.form.domains, 'Choose domains');
    renderSummaryChips(dom.previewSkills, state.form.skills, 'All matching skills');
    renderSummaryChips(dom.previewDifficulty, state.form.difficulty, 'All levels');
    return;
  }

  dom.previewState.textContent = state.previewStale ? 'Needs refresh' : 'Ready';
  dom.previewState.className = `state-pill ${state.previewStale ? 'state-pill-warn' : 'state-pill-success'}`;
  dom.previewMatched.textContent = formatCount(preview.matchedCount);
  dom.previewExportCount.textContent = formatCount(preview.exportCount);
  dom.previewTotalBatches.textContent = formatCount(preview.totalBatches);
  dom.previewExportBatches.textContent = formatCount(preview.exportBatches);
    dom.previewAssessment.textContent = previewConfig.assessment || state.form.assessment || '--';
    dom.previewSection.textContent = previewConfig.section || state.form.section || '--';
  dom.previewMode.textContent = formatMode(
    previewConfig.mode || state.form.mode,
    previewConfig.includeAnswerKey ?? state.form.includeAnswerKey
  );
  dom.previewAvailable.textContent = formatCount(preview.availableCount);
    dom.previewSkipped.textContent = previewConfig.excludeExported
      ? formatCount(preview.excludedPreviouslyExportedCount)
      : 'Filter off';
    renderSummaryChips(dom.previewDomains, previewConfig.domains, 'Choose domains');
  renderSummaryChips(dom.previewSkills, previewConfig.skills, 'All matching skills');
  renderSummaryChips(dom.previewDifficulty, previewConfig.difficulty, 'All levels');
}

function renderJob() {
  const job = state.job;

  if (!job) {
    dom.jobState.textContent = 'Idle';
    dom.jobState.className = 'state-pill state-pill-muted';
    dom.jobPhase.textContent = 'Waiting for an export job';
    dom.jobPercent.textContent = '0%';
    dom.jobProgress.style.width = '0%';
    dom.jobMessage.textContent =
      state.runtimeMode === 'browser'
        ? 'Preview the current configuration or open the print dialog when you are ready.'
        : 'Preview the current configuration or start a render when you are ready.';
    dom.jobNote.textContent =
      state.runtimeMode === 'browser'
        ? 'Browser mode opens the print dialog directly. Save each packet as PDF there.'
        : 'Exports stay local; progress updates automatically once a job starts.';
    dom.jobId.textContent = '--';
    dom.jobBatch.textContent = '--';
    dom.jobSavedCount.textContent = '0';
    dom.jobOutput.textContent = '--';
    renderSavedFiles([]);
    return;
  }

  const progress = getProgressValue(job);
  const stateLabel = formatState(job.state);

  dom.jobState.textContent = stateLabel;
  dom.jobState.className = `state-pill ${getJobStateClass(job.state)}`;
  dom.jobPhase.textContent = formatPhase(job.phase);
  dom.jobPercent.textContent = `${progress}%`;
  dom.jobProgress.style.width = `${progress}%`;
  dom.jobMessage.textContent = job.error || job.message || 'Job running.';
  dom.jobNote.textContent = getJobNote(job);
  dom.jobId.textContent = state.jobId || '--';
  dom.jobBatch.textContent =
    job.currentBatch && job.totalBatches ? `${job.currentBatch} / ${job.totalBatches}` : '--';
  dom.jobSavedCount.textContent = String(job.savedFiles?.length || 0);
  dom.jobOutput.textContent = job.outputDir || '--';
  renderSavedFiles(job.savedFiles || []);
}

function renderSavedFiles(files) {
  dom.savedFiles.replaceChildren();

  if (!files.length) {
    const empty = document.createElement('li');
    empty.className = 'saved-files-empty';
    empty.textContent = 'No files saved yet.';
    dom.savedFiles.append(empty);
    return;
  }

  files.slice(-4).reverse().forEach((file) => {
    const item = document.createElement('li');
    item.textContent = file;
    dom.savedFiles.append(item);
  });
}

function renderHistoryFeedback(message, className) {
  dom.exportHistoryFeedback.className = className;
  dom.exportHistoryFeedback.textContent = message;
}

function renderHistoryEntries(entries) {
  dom.exportHistoryList.replaceChildren();

  entries.forEach((entry) => {
    dom.exportHistoryList.append(createHistoryEntryItem(entry));
  });
}

function createHistoryEntryItem(entry) {
  const item = document.createElement('li');
  item.className = 'history-entry';
  const details = document.createElement('details');
  details.className = 'history-entry-disclosure';

  const summary = document.createElement('summary');
  summary.className = 'history-entry-summary';

  const header = document.createElement('div');
  header.className = 'history-entry-header';

  const headingBlock = document.createElement('div');
  const title = document.createElement('p');
  title.className = 'history-entry-title';
  title.textContent = formatHistoryBatchTitle(entry);

  const subtitle = document.createElement('p');
  subtitle.className = 'history-entry-subtitle';
  const questionCount = entry.questionCount || entry.questions?.length || 0;
  subtitle.textContent = `${questionCount} question${
    questionCount === 1 ? '' : 's'
  } · ${formatMode(entry.mode, entry.includeAnswerKey)} · ${formatHistoryEntryTimestamp(entry.exportedAt)}`;

  headingBlock.append(title, subtitle);
  header.append(headingBlock);

  const meta = document.createElement('div');
  meta.className = 'history-entry-meta';
  meta.append(createSummaryChip(entry.section || 'Unknown section', false));
  (entry.includedDomains || []).slice(0, 3).forEach((domain) => {
    meta.append(createSummaryChip(domain, false));
  });
  if ((entry.includedDomains || []).length > 3) {
    meta.append(createSummaryChip(`+${entry.includedDomains.length - 3} more`, true));
  }
  header.append(meta);
  summary.append(header);

  const body = document.createElement('div');
  body.className = 'history-entry-body';

  const filename = document.createElement('p');
  filename.className = 'history-entry-file';
  filename.textContent = entry.filename || 'Saved batch';
  body.append(filename);

  const questionList = document.createElement('ul');
  questionList.className = 'history-question-list';

  (entry.questions || []).forEach((question) => {
    const questionItem = document.createElement('li');
    questionItem.className = 'history-question-item';

    const questionTitle = document.createElement('p');
    questionTitle.className = 'history-question-title';
    questionTitle.textContent = question.questionId;

    const questionMeta = document.createElement('div');
    questionMeta.className = 'history-question-meta';
    if (question.domain) {
      questionMeta.append(createSummaryChip(question.domain, false));
    }
    if (question.skill) {
      questionMeta.append(createSummaryChip(question.skill, false));
    }
    if (question.difficultyLabel) {
      questionMeta.append(createSummaryChip(question.difficultyLabel, false));
    }

    questionItem.append(questionTitle);
    if (questionMeta.childNodes.length) {
      questionItem.append(questionMeta);
    }
    questionList.append(questionItem);
  });

  body.append(questionList);
  details.append(summary, body);
  item.append(details);
  return item;
}

function renderSummaryChips(container, values, emptyLabel) {
  if (!container) {
    return;
  }

  container.replaceChildren();

  if (!Array.isArray(values) || !values.length) {
    container.append(createSummaryChip(emptyLabel, true));
    return;
  }

  values.forEach((value) => {
    container.append(createSummaryChip(value, false));
  });
}

function createSummaryChip(label, muted) {
  const chip = document.createElement('span');
  chip.className = `summary-chip${muted ? ' summary-chip-muted' : ''}`;
  chip.textContent = label;
  return chip;
}

function formatHistoryBatchTitle(entry) {
  const base = `${entry.assessment || 'SAT'} ${entry.section || 'Section'}`;
  return entry.batchNumber ? `${base} - Batch ${entry.batchNumber}` : base;
}

function formatHistoryEntryTimestamp(value) {
  if (!value) {
    return 'Saved recently';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Saved recently';
  }

  return date.toLocaleString();
}

function getProgressValue(job) {
  if (!job) {
    return 0;
  }

  if (job.state === 'completed' || job.phase === 'completed') {
    return 100;
  }

  const totalBatches = Math.max(job.totalBatches || 1, 1);
  const currentBatch = Math.max(job.currentBatch || 1, 1);
  const batchRatio = (currentBatch - 1) / totalBatches;

  switch (job.phase) {
    case 'queued':
      return 4;
    case 'lookup':
      return 12;
    case 'list':
      return 24;
    case 'preparing-output':
      return 38;
    case 'details':
      return Math.round(46 + batchRatio * 22);
    case 'rendering':
      return Math.round(60 + batchRatio * 22);
    case 'saved':
      return Math.round(72 + (currentBatch / totalBatches) * 24);
    case 'failed':
      return 100;
    default:
      return 18;
  }
}

function getJobNote(job) {
  if (job.state === 'completed') {
    if (state.runtimeMode === 'browser') {
      return `Prepared ${job.savedFiles?.length || 0} printable packet${job.savedFiles?.length === 1 ? '' : 's'}. Save each one as PDF from the print dialog.`;
    }

    return `Saved ${job.savedFiles?.length || 0} file${job.savedFiles?.length === 1 ? '' : 's'} to ${job.outputDir || 'the chosen output folder'}.`;
  }

  if (job.state === 'failed') {
    return 'Review the error banner, adjust the configuration if needed, and start a new local export.';
  }

  if (job.state === 'queued') {
    return state.runtimeMode === 'browser'
      ? 'The browser is preparing the print dialog right away.'
      : 'The export request is registered locally and will begin polling for progress right away.';
  }

  return state.runtimeMode === 'browser'
    ? 'Building printable packets in the browser and opening the print dialog without a server worker.'
    : `Writing PDFs into ${job.outputDir || state.form.outputDir} while polling status every moment.`;
}

function formatCount(value) {
  return typeof value === 'number' ? value.toLocaleString() : '--';
}

function formatMode(value, includeAnswerKey = false) {
  if (!value) {
    return '--';
  }

  const label = MODE_LABELS[value] || `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

  if (!includeAnswerKey || value === 'teacher') {
    return label;
  }

  return `${label} + Answer key`;
}

export function __testFormatMode(value, includeAnswerKey = false) {
  return formatMode(value, includeAnswerKey);
}

function formatState(value) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Idle';
}

function formatPhase(value) {
  if (!value) {
    return 'Waiting for an export job';
  }

  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getJobStateClass(value) {
  switch (value) {
    case 'completed':
      return 'state-pill-success';
    case 'failed':
      return 'state-pill-danger';
    case 'running':
      return 'state-pill-active';
    default:
      return 'state-pill-muted';
  }
}

function formatHistoryUpdatedAt(value) {
  if (!value) {
    return 'Waiting for local history data.';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Updated recently on this machine.';
  }

  return `Updated ${date.toLocaleString()}`;
}

function getHistoryStatusMessage({ isLoading, hasError, isEmpty, batchCount, questionCount, legacyQuestionKeyCount }) {
  if (hasError) {
    return 'The local export history could not be read.';
  }

  if (isLoading) {
    return 'Reading the local export cache…';
  }

  if (isEmpty) {
    return 'The cache is empty right now.';
  }

  if (legacyQuestionKeyCount && !batchCount) {
    return `${legacyQuestionKeyCount.toLocaleString()} legacy question key${
      legacyQuestionKeyCount === 1 ? '' : 's'
    } are active for duplicate filtering.`;
  }

  return `${batchCount.toLocaleString()} batch${batchCount === 1 ? '' : 'es'} covering ${questionCount.toLocaleString()} question${
    questionCount === 1 ? '' : 's'
  } available for review.`;
}

function setError(message) {
  state.error = message;
  renderError();
}

function clearError() {
  state.error = '';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    if (data.jobId) {
      error.jobId = data.jobId;
    }
    throw error;
  }

  return data;
}
