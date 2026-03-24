function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return { text: '', json: null };
  }

  try {
    return {
      text,
      json: JSON.parse(text),
    };
  } catch {
    return {
      text,
      json: null,
    };
  }
}

async function requestJson(baseUrl, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(payload.json?.error || `Worker request failed: ${response.status}`);
    error.statusCode = response.status;

    if (payload.json?.jobId) {
      error.jobId = payload.json.jobId;
    }

    if (response.status === 409) {
      error.code = 'ACTIVE_EXPORT_EXISTS';
    }

    throw error;
  }

  return payload.json;
}

async function requestText(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await readResponseBody(response);

  if (!response.ok) {
    const error = new Error(payload.json?.error || payload.text || `Worker request failed: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }

  return payload.text;
}

export function createRemoteWorkerClient({ baseUrl }) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);

  if (!normalizedBaseUrl) {
    throw new Error('A worker base URL is required to create a remote worker client.');
  }

  return {
    async preview(input) {
      const payload = await requestJson(normalizedBaseUrl, '/preview', {
        method: 'POST',
        body: input,
      });
      return payload.preview;
    },
    async startExport(input) {
      return requestJson(normalizedBaseUrl, '/jobs', {
        method: 'POST',
        body: input,
      });
    },
    async getActiveJob() {
      const payload = await requestJson(normalizedBaseUrl, '/jobs/active');
      return payload.job;
    },
    async getJob(jobId) {
      try {
        const payload = await requestJson(normalizedBaseUrl, `/jobs/${encodeURIComponent(jobId)}`);
        return payload.job;
      } catch (error) {
        if (error.statusCode === 404) {
          return null;
        }

        throw error;
      }
    },
    async clearHistory() {
      return requestJson(normalizedBaseUrl, '/history/clear', {
        method: 'POST',
      });
    },
    async readHistory() {
      const payload = await requestJson(normalizedBaseUrl, '/history');
      return payload.history;
    },
    async downloadHistory() {
      return requestText(normalizedBaseUrl, '/history/download');
    },
    async importHistory(history) {
      const payload = await requestJson(normalizedBaseUrl, '/history/import', {
        method: 'POST',
        body: { history },
      });
      return payload.history;
    },
  };
}
