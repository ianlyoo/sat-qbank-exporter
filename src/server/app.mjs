import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_EXPORT_OPTIONS } from '../core/constants.mjs';
import {
  clearExportHistory,
  importExportHistory,
  readExportHistorySnapshot,
} from '../core/export-history.mjs';
import { mapLookupForUi } from '../core/helpers.mjs';
import { previewExport, runExport } from '../core/exporter.mjs';
import { fetchQuestionLookup } from '../core/qbank.mjs';
import { createLocalWorkerClient } from './local-worker-client.mjs';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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

function sendDownload(response, filename, contents) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-disposition': `attachment; filename="${filename}"`,
  });
  response.end(contents);
}

function mapHistoryPayload(history) {
  return {
    batchCount: history.batches.length,
    questionCount: history.questionKeys.length,
    legacyQuestionKeyCount: history.legacyQuestionKeyCount,
    updatedAt: history.updatedAt,
    batches: history.batches,
  };
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

export function createAppServer({
  workerClient,
  exportRunner = runExport,
  previewRunner = previewExport,
  lookupFetcher = fetchQuestionLookup,
  clearHistory = clearExportHistory,
  historyReader = readExportHistorySnapshot,
  historyImporter = importExportHistory,
} = {}) {
  const resolvedWorkerClient =
    workerClient ||
    createLocalWorkerClient({
      exportRunner,
      previewRunner,
      clearHistoryRunner: clearHistory,
      historyReader,
      historyImporter,
    });

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
        const preview = await resolvedWorkerClient.preview(body);
        sendJson(response, 200, { preview });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/export') {
        const body = await readJsonBody(request);
        const result = await resolvedWorkerClient.startExport(body);
        sendJson(response, 202, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/export-history/clear') {
        const result = await resolvedWorkerClient.clearHistory();
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/export-history') {
        const history = await resolvedWorkerClient.readHistory();
        sendJson(response, 200, { history: mapHistoryPayload(history) });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/export-history/download') {
        const contents = await resolvedWorkerClient.downloadHistory();
        sendDownload(response, 'sat-export-history.json', contents);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/export-history/import') {
        const body = await readJsonBody(request);
        const history = await resolvedWorkerClient.importHistory(body.history ?? body);
        sendJson(response, 200, { history: mapHistoryPayload(history) });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/status') {
        const job = await resolvedWorkerClient.getActiveJob();
        sendJson(response, 200, { job });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/status/')) {
        const jobId = url.pathname.replace('/api/status/', '');
        const job = await resolvedWorkerClient.getJob(jobId);

        if (!job) {
          sendJson(response, 404, { error: 'Export job not found.' });
          return;
        }

        sendJson(response, 200, { job });
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

      const statusCode = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      sendJson(response, statusCode, { error: error.message });
    }
  });
}
