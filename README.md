# SAT Question Bank Exporter

An unofficial local-first SAT question bank exporter with a desktop-friendly web UI and a CLI fallback.

It lets you choose an assessment, section, domains, skills, difficulty, question count, batching rules, and export polished PDF practice sets from your own machine.

## What It Does

- Loads SAT Suite lookup data from the College Board question bank
- Filters questions by section, domains, skills, and difficulty
- Previews how many questions match before exporting
- Renders student, teacher, or clean PDF batches locally with Playwright
- Optionally appends a separate answer key and rationale section after each batch
- Optionally skips questions that were already exported on your machine

## What This Project Is

- Local-only: nothing is hosted and no account is required
- Unofficial: this is not affiliated with College Board
- Practical: built for students/educators who want printable practice packets quickly

## Requirements

- Node.js 20+
- npm
- Playwright Chromium browser

## Setup

```bash
npm install
npx playwright install chromium
```

If `npx playwright install chromium` does not work in your environment, use:

```bash
node node_modules/playwright/cli.js install chromium
```

## Run The Web UI

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

By default, exported PDFs are saved to the project's `output/` folder.

## CLI Usage

The web UI is the recommended way to use the project, but the CLI still works.

```bash
npm run export -- \
  --assessment "SAT" \
  --section "Math" \
  --domains "Algebra" \
  --skills "Linear functions" \
  --difficulty "Easy,Medium" \
  --question-count 20 \
  --chunk-size 10 \
  --mode student \
  --output ./output/math
```

## Useful CLI Options

- `--question-count 20` total questions to export
- `--chunk-size 10` questions per PDF file
- `--difficulty "Easy,Medium"` difficulty filter
- `--skills "Linear functions,Inferences"` skill filter
- `--include-answer-key true` append an answer key and rationale section after each batch
- `--exclude-active true` skip active/live items when available
- `--exclude-exported true` skip questions already exported on this machine
- `--preview` show counts without rendering PDFs

## Export Modes

- `student` prompts only
- `teacher` includes answers and rationale
- `clean` minimal formatting and headers

## Local Export History

When `Skip previously exported questions` is enabled in the UI, or `--exclude-exported true` is used in the CLI, the app checks a local cache file at:

```text
.sat-exporter/export-history.json
```

That file is only used on your machine and is not meant to be committed.

## Development

Run tests:

```bash
npm test
```

## Notes

- Use this project within College Board terms and your local copyright boundaries.
- API behavior may change if the upstream question bank changes.
- This repository is designed for local use, not as a hosted service.
