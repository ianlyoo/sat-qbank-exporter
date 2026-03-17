import { DEFAULT_EXPORT_OPTIONS, EXPORT_MODES } from '../core/constants.mjs';
import { parseBoolean, parseInteger, parseList } from '../core/helpers.mjs';
import { previewExport, runExport } from '../core/exporter.mjs';

function printHelp() {
  console.log(`
Usage:
  node batch_export.mjs --assessment "SAT" --section "Math" --domains "Algebra" [options]

Required:
  --assessment     "SAT" | "PSAT/NMSQT & PSAT 10" | "PSAT 8/9"
  --section        "Math" | "Reading and Writing"
  --domains        Comma-separated domain labels exactly as shown in the app

Optional:
  --output         Download folder (default: ${DEFAULT_EXPORT_OPTIONS.outputDir})
  --mode           student | teacher | clean (default: ${DEFAULT_EXPORT_OPTIONS.mode})
  --chunk-size     Questions per PDF batch (default: ${DEFAULT_EXPORT_OPTIONS.chunkSize})
  --question-count Total questions to export (default: ${DEFAULT_EXPORT_OPTIONS.questionCount})
  --from-page      First batch number to export (default: ${DEFAULT_EXPORT_OPTIONS.fromPage})
  --to-page        Last batch number to export (default: all batches)
  --difficulty     Comma-separated: Easy, Medium, Hard
  --skills         Comma-separated skill labels
  --exclude-active true | false (default: ${DEFAULT_EXPORT_OPTIONS.excludeActive})
  --exclude-exported true | false (default: ${DEFAULT_EXPORT_OPTIONS.excludeExported})
  --shuffle        true | false (default: ${DEFAULT_EXPORT_OPTIONS.shuffle})
  --headed         true | false (default: ${DEFAULT_EXPORT_OPTIONS.headed})
  --preview        Show counts without rendering PDFs

Modes:
  ${Object.keys(EXPORT_MODES).join(', ')}
`.trim());
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = 'true';
    }
  }

  return args;
}

function mapCliToOptions(rawArgs) {
  return {
    assessment: rawArgs.assessment,
    section: rawArgs.section,
    domains: parseList(rawArgs.domains),
    skills: parseList(rawArgs.skills),
    difficulty: parseList(rawArgs.difficulty),
    questionCount: parseInteger(rawArgs['question-count'], DEFAULT_EXPORT_OPTIONS.questionCount),
    chunkSize: parseInteger(rawArgs['chunk-size'] ?? rawArgs['per-page'], DEFAULT_EXPORT_OPTIONS.chunkSize),
    mode: rawArgs.mode || DEFAULT_EXPORT_OPTIONS.mode,
    outputDir: rawArgs.output || DEFAULT_EXPORT_OPTIONS.outputDir,
    excludeActive: parseBoolean(rawArgs['exclude-active'], DEFAULT_EXPORT_OPTIONS.excludeActive),
    excludeExported: parseBoolean(
      rawArgs['exclude-exported'],
      DEFAULT_EXPORT_OPTIONS.excludeExported
    ),
    shuffle: parseBoolean(rawArgs.shuffle, DEFAULT_EXPORT_OPTIONS.shuffle),
    fromPage: parseInteger(rawArgs['from-page'], DEFAULT_EXPORT_OPTIONS.fromPage),
    toPage:
      rawArgs['to-page'] === undefined ? null : parseInteger(rawArgs['to-page'], DEFAULT_EXPORT_OPTIONS.toPage),
    headed: parseBoolean(rawArgs.headed, DEFAULT_EXPORT_OPTIONS.headed),
  };
}

function logProgress(event) {
  if (!event?.message) {
    return;
  }

  if (event.totalBatches && event.currentBatch) {
    console.log(`${event.message} (${event.currentBatch}/${event.totalBatches})`);
    return;
  }

  console.log(event.message);
}

export async function runCli(argv = process.argv.slice(2)) {
  const rawArgs = parseArgs(argv);

  if (rawArgs.help || rawArgs.h) {
    printHelp();
    return;
  }

  const options = mapCliToOptions(rawArgs);

  if (parseBoolean(rawArgs.preview, false)) {
    const preview = await previewExport(options, { onProgress: logProgress });
    const historyLine = options.excludeExported
      ? ` ${preview.excludedPreviouslyExportedCount} previously exported questions were skipped from ${preview.exportHistoryCount} cached entries.`
      : '';
    console.log(
      `Matched ${preview.matchedCount} questions. ${preview.availableCount} remain available. Exporting ${preview.exportCount} across ${preview.exportBatches} PDF files.${historyLine}`
    );
    return;
  }

  const result = await runExport(options, { onProgress: logProgress });
  console.log(`Finished. Files saved to ${result.outputDir}`);
}
