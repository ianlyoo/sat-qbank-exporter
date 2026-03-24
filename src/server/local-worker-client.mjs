import { randomUUID } from 'node:crypto';

import {
  clearExportHistory,
  importExportHistory,
  readExportHistorySnapshot,
  serializeExportHistorySnapshot,
} from '../core/export-history.mjs';
import { normalizeExportOptions } from '../core/helpers.mjs';
import { formatProgress, previewExport, runExport } from '../core/exporter.mjs';

function createJobStore() {
  const jobs = new Map();
  let activeJobId = null;

  return {
    create(config) {
      if (activeJobId) {
        const activeJob = jobs.get(activeJobId);
        if (activeJob && activeJob.state !== 'completed' && activeJob.state !== 'failed') {
          const error = new Error('An export is already running. Wait for it to finish before starting a new one.');
          error.code = 'ACTIVE_EXPORT_EXISTS';
          error.jobId = activeJobId;
          throw error;
        }
      }

      const id = randomUUID();
      const job = {
        id,
        state: 'queued',
        phase: 'queued',
        message: 'Export queued',
        matchedCount: null,
        exportCount: null,
        currentBatch: null,
        totalBatches: null,
        savedFiles: [],
        error: null,
        outputDir: null,
        config,
        createdAt: new Date().toISOString(),
      };

      jobs.set(id, job);
      activeJobId = id;
      return job;
    },
    get(id) {
      return jobs.get(id) || null;
    },
    getActive() {
      if (!activeJobId) {
        return null;
      }

      return jobs.get(activeJobId) || null;
    },
    update(id, patch) {
      const current = jobs.get(id);
      if (!current) {
        return null;
      }

      const next = {
        ...current,
        ...patch,
        savedFiles: patch.savedFiles ? [...patch.savedFiles] : current.savedFiles,
        updatedAt: new Date().toISOString(),
      };

      jobs.set(id, next);

      if (activeJobId === id && (next.state === 'completed' || next.state === 'failed')) {
        activeJobId = null;
      }

      return next;
    },
  };
}

export function createLocalWorkerClient({
  previewRunner = previewExport,
  exportRunner = runExport,
  clearHistoryRunner = clearExportHistory,
  historyReader = readExportHistorySnapshot,
  historyImporter = importExportHistory,
} = {}) {
  const jobStore = createJobStore();

  return {
    async preview(input) {
      return previewRunner(input);
    },
    async startExport(input) {
      const config = normalizeExportOptions(input);
      const job = jobStore.create(config);

      exportRunner(config, {
        onProgress(progress) {
          jobStore.update(job.id, progress);
        },
      })
        .then((result) => {
          jobStore.update(job.id, {
            state: 'completed',
            phase: 'completed',
            message: 'Export complete',
            matchedCount: result.matchedCount,
            exportCount: result.exportCount,
            totalBatches: result.totalBatches,
            savedFiles: result.savedFiles,
            outputDir: result.outputDir,
            config: result.config,
          });
        })
        .catch((error) => {
          jobStore.update(job.id, {
            state: 'failed',
            phase: 'failed',
            message: 'Export failed',
            error: error.message,
          });
        });

      return { jobId: job.id };
    },
    async getActiveJob() {
      const activeJob = jobStore.getActive();
      return activeJob ? formatProgress(activeJob) : null;
    },
    async getJob(jobId) {
      const job = jobStore.get(jobId);
      return job ? formatProgress(job) : null;
    },
    async clearHistory() {
      await clearHistoryRunner();
      return { ok: true };
    },
    async readHistory() {
      return historyReader(undefined, { strict: true });
    },
    async downloadHistory() {
      const history = await historyReader(undefined, { strict: true });
      return serializeExportHistorySnapshot(history);
    },
    async importHistory(history) {
      return historyImporter(history);
    },
  };
}
