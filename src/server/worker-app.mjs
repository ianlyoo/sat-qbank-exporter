import { createServer } from 'node:http';

import { DEFAULT_EXPORT_OPTIONS } from '../core/constants.mjs';
import { mapLookupForUi } from '../core/helpers.mjs';
import { fetchQuestionLookup } from '../core/qbank.mjs';
import { createLocalWorkerClient } from './local-worker-client.mjs';

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

function matchesPath(pathname, ...candidates) {
  return candidates.includes(pathname);
}

export function createWorkerServer({ lookupFetcher = fetchQuestionLookup, ...workerOptions } = {}) {
  const workerClient = createLocalWorkerClient(workerOptions);

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    try {
      if (request.method === 'GET' && matchesPath(url.pathname, '/health', '/api/health')) {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'GET' && matchesPath(url.pathname, '/defaults', '/api/defaults')) {
        sendJson(response, 200, { defaults: DEFAULT_EXPORT_OPTIONS });
        return;
      }

      if (request.method === 'GET' && matchesPath(url.pathname, '/lookup', '/api/lookup')) {
        const lookup = await lookupFetcher();
        sendJson(response, 200, { lookup: mapLookupForUi(lookup.lookupData) });
        return;
      }

      if (request.method === 'POST' && matchesPath(url.pathname, '/preview', '/api/preview')) {
        const body = await readJsonBody(request);
        const preview = await workerClient.preview(body);
        sendJson(response, 200, { preview });
        return;
      }

      if (request.method === 'POST' && matchesPath(url.pathname, '/jobs', '/api/export')) {
        const body = await readJsonBody(request);
        const result = await workerClient.startExport(body);
        sendJson(response, 202, result);
        return;
      }

      if (request.method === 'GET' && matchesPath(url.pathname, '/jobs/active', '/api/status')) {
        const job = await workerClient.getActiveJob();
        sendJson(response, 200, { job });
        return;
      }

      if (
        request.method === 'GET' &&
        (url.pathname.startsWith('/jobs/') || url.pathname.startsWith('/api/status/'))
      ) {
        const jobId = url.pathname.startsWith('/api/status/')
          ? url.pathname.replace('/api/status/', '')
          : url.pathname.replace('/jobs/', '');
        const job = await workerClient.getJob(jobId);

        if (!job) {
          sendJson(response, 404, { error: 'Export job not found.' });
          return;
        }

        sendJson(response, 200, { job });
        return;
      }

      if (request.method === 'POST' && matchesPath(url.pathname, '/history/clear', '/api/export-history/clear')) {
        const result = await workerClient.clearHistory();
        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'GET' && matchesPath(url.pathname, '/history', '/api/export-history')) {
        const history = await workerClient.readHistory();
        sendJson(response, 200, { history });
        return;
      }

      if (
        request.method === 'GET' &&
        matchesPath(url.pathname, '/history/download', '/api/export-history/download')
      ) {
        const contents = await workerClient.downloadHistory();
        sendDownload(response, 'sat-export-history.json', contents);
        return;
      }

      if (
        request.method === 'POST' &&
        matchesPath(url.pathname, '/history/import', '/api/export-history/import')
      ) {
        const body = await readJsonBody(request);
        const history = await workerClient.importHistory(body.history ?? body);
        sendJson(response, 200, { history });
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
