import {
  GET_QUESTIONS_URL,
  LEGACY_DISCLOSED_BASE_URL,
  LOOKUP_URL,
  PDF_DOWNLOAD_URL,
} from './constants.mjs';

let lookupCache = null;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }

  return response.json();
}

export async function fetchQuestionLookup({ force = false } = {}) {
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

export async function fetchQuestionList(payload) {
  return fetchJson(GET_QUESTIONS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchQuestionDetails(externalIds) {
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

export async function fetchLegacyQuestionDetail(ibn) {
  const response = await fetch(`${LEGACY_DISCLOSED_BASE_URL}/${encodeURIComponent(ibn)}.json`);
  if (!response.ok) {
    throw new Error(`Legacy question fetch failed for ${ibn}: ${response.status} ${response.statusText}`);
  }

  const items = await response.json();
  return items[0];
}

export async function fetchLegacyQuestionDetails(ibns) {
  if (!ibns.length) {
    return [];
  }

  return Promise.all(ibns.map((ibn) => fetchLegacyQuestionDetail(ibn)));
}
