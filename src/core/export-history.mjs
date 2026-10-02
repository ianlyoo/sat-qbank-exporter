import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultExportHistoryPath } from './storage.mjs';
import {
  buildPersistedPayload,
  createBatchRecord,
  createEmptySnapshot,
  createInvalidCacheError,
  mergeSnapshots,
  normalizeExportHistoryData,
} from './export-history-model.mjs';

export { filterPreviouslyExportedQuestions, serializeExportHistorySnapshot } from './export-history-model.mjs';

// A history mutation includes its read, merge and atomic replacement. Serializing
// only the write would still let simultaneous imports/exports lose each other.
// This queue coordinates this process; separate processes need separate stores.
const pendingMutations = new Map();

function mutateHistory(filePath, mutation) {
  const resolvedPath = path.resolve(filePath);
  const previous = pendingMutations.get(resolvedPath) ?? Promise.resolve();
  const result = previous.then(() => mutation(resolvedPath));
  // A failed operation must reject its caller without poisoning the queue.
  const settled = result.then(() => {}, () => {});
  pendingMutations.set(resolvedPath, settled);
  void settled.then(() => {
    if (pendingMutations.get(resolvedPath) === settled) {
      pendingMutations.delete(resolvedPath);
    }
  });
  return result;
}

async function writeExportHistorySnapshot(snapshot, filePath) {
  const payload = buildPersistedPayload(snapshot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  const handle = await fs.open(tempPath, 'wx');
  try {
    try {
      await handle.writeFile(JSON.stringify(payload, null, 2));
    } finally {
      await handle.close();
    }
    await fs.rename(tempPath, filePath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return normalizeExportHistoryData(payload, { strict: true });
}

export async function readExportHistorySnapshot(filePath = getDefaultExportHistoryPath(), { strict = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeExportHistoryData(parsed, { strict });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptySnapshot();
    }

    if (error.name === 'SyntaxError') {
      if (strict) {
        throw createInvalidCacheError();
      }

      return createEmptySnapshot();
    }

    throw error;
  }
}

export async function loadExportHistory(filePath = getDefaultExportHistoryPath(), { strict = false } = {}) {
  const snapshot = await readExportHistorySnapshot(filePath, { strict });
  return new Set(snapshot.questionKeys);
}

export async function appendExportHistory(
  config,
  questions,
  filePath = getDefaultExportHistoryPath(),
  metadata = {}
) {
  return mutateHistory(filePath, async (resolvedPath) => {
    const snapshot = await readExportHistorySnapshot(resolvedPath);
    const nextSnapshot = mergeSnapshots(snapshot, {
      batches: [createBatchRecord(config, questions, metadata)],
      legacyQuestionKeys: [],
    });
    return writeExportHistorySnapshot(nextSnapshot, resolvedPath);
  });
}

export async function importExportHistory(history, filePath = getDefaultExportHistoryPath()) {
  let incoming;
  try {
    incoming = normalizeExportHistoryData(history, { strict: true });
  } catch {
    throw createInvalidCacheError('The selected export-history file is invalid.');
  }

  return mutateHistory(filePath, async (resolvedPath) => {
    const current = await readExportHistorySnapshot(resolvedPath);
    return writeExportHistorySnapshot(mergeSnapshots(current, incoming), resolvedPath);
  });
}

export async function clearExportHistory(filePath = getDefaultExportHistoryPath()) {
  return mutateHistory(filePath, async (resolvedPath) => {
    try {
      await fs.unlink(resolvedPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  });
}
