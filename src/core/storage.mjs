import path from 'node:path';

function getStorageRoot() {
  const value = String(process.env.SAT_EXPORT_STORAGE_DIR || '').trim();
  return value ? path.resolve(value) : null;
}

export function resolveManagedPath(targetPath) {
  const normalizedTarget = String(targetPath || '').trim();

  if (!normalizedTarget) {
    throw new Error('Expected a filesystem path.');
  }

  if (path.isAbsolute(normalizedTarget)) {
    return path.resolve(normalizedTarget);
  }

  const storageRoot = getStorageRoot();
  return storageRoot ? path.resolve(storageRoot, normalizedTarget) : path.resolve(normalizedTarget);
}

export function getDefaultExportHistoryPath() {
  const explicitPath = String(process.env.SAT_EXPORT_HISTORY_PATH || '').trim();
  if (explicitPath) {
    return resolveManagedPath(explicitPath);
  }

  const storageRoot = getStorageRoot();
  return storageRoot
    ? path.resolve(storageRoot, '.sat-exporter/export-history.json')
    : path.resolve('.sat-exporter/export-history.json');
}
