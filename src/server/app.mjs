import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_EXPORT_OPTIONS } from '../core/constants.mjs';
import { mapLookupForUi, normalizeExportOptions } from '../core/helpers.mjs';
import { formatProgress, previewExport, runExport } from '../core/exporter.mjs';
import { fetchQuestionLookup } from '../core/qbank.mjs';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

async function serveStaticFile(response, requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

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

export function createAppServer({
  exportRunner = runExport,
  previewRunner = previewExport,
  lookupFetcher = fetchQuestionLookup,
} = {}) {
  const jobStore = createJobStore();

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/defaults') {
        sendJson(response, 200, { defaults: DEFAULT_EXPORT_OPTIONS });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/lookup') {
        const lookup = await lookupFetcher();
        sendJson(response, 200, { lookup: mapLookupForUi(lookup.lookupData) });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/preview') {
        const body = await readJsonBody(request);
        const preview = await previewRunner(body);
        sendJson(response, 200, { preview });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/export') {
        const body = await readJsonBody(request);
        const config = normalizeExportOptions(body);
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

        sendJson(response, 202, { jobId: job.id });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/status') {
        const activeJob = jobStore.getActive();
        sendJson(response, 200, { job: activeJob ? formatProgress(activeJob) : null });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/status/')) {
        const jobId = url.pathname.replace('/api/status/', '');
        const job = jobStore.get(jobId);

        if (!job) {
          sendJson(response, 404, { error: 'Export job not found.' });
          return;
        }

        sendJson(response, 200, { job: formatProgress(job) });
        return;
      }

      if (request.method === 'GET') {
        await serveStaticFile(response, url.pathname);
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      if (error.code === 'ACTIVE_EXPORT_EXISTS') {
        sendJson(response, 409, {
          error: error.message,
          jobId: error.jobId,
        });
        return;
      }

      sendJson(response, 400, { error: error.message });
    }
  });
}
