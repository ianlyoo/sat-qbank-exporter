import fs from 'node:fs/promises';
import path from 'node:path';

const EXPORT_HISTORY_PATH = path.resolve('.sat-exporter/export-history.json');

function createQuestionKey(config, question) {
  return `${config.assessment}::${config.section}::${question.questionId}`;
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function loadExportHistory(filePath = EXPORT_HISTORY_PATH, { strict = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.questionKeys)) {
      if (strict) {
        throw new Error('The local export-history cache is invalid. Remove .sat-exporter/export-history.json and try again.');
      }
      return new Set();
    }

    return new Set(parsed.questionKeys.map((item) => String(item)));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return new Set();
    }

    if (error.name === 'SyntaxError') {
      if (strict) {
        throw new Error('The local export-history cache is invalid. Remove .sat-exporter/export-history.json and try again.');
      }

      return new Set();
    }

    throw error;
  }
}

export async function appendExportHistory(config, questions, filePath = EXPORT_HISTORY_PATH) {
  const existing = await loadExportHistory(filePath);

  for (const question of questions) {
    existing.add(createQuestionKey(config, question));
  }

  await ensureParentDirectory(filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(
    tempPath,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        questionKeys: [...existing].sort(),
      },
      null,
      2
    )
  );
  await fs.rename(tempPath, filePath);

  return existing;
}

export function filterPreviouslyExportedQuestions(config, questions, historySet) {
  return questions.filter((question) => !historySet.has(createQuestionKey(config, question)));
}
