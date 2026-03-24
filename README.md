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

## Quick Start

For release builds or local zip copies:

- Windows: double-click [`launch.bat`](./launch.bat)
- macOS: double-click [`launch.command`](./launch.command)

The launcher will:

- warn you if Node.js is missing
- run first-time setup automatically when dependencies or Playwright Chromium are not ready
- start the local server
- open the app in your browser at `http://localhost:4173`

By default, exported PDFs are saved to the project's `output/` folder.

## GitHub Releases

Release packages can be generated with:

```bash
npm run package:release
```

That command creates platform-specific zip files in `dist/release/` for Windows and macOS.

## Manual Setup

If you want to run the project manually instead of using the launcher:

```bash
npm install
node node_modules/playwright/cli.js install chromium
npm start
```

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

## Hosted Architecture In Progress

This repository now supports a split deployment model for hosted use:

- `npm start` runs the web app server
- `npm run start:worker` runs a dedicated export worker
- `SAT_WORKER_BASE_URL` tells the web app to forward preview, export, job-status, and export-history requests to that worker

That split is the first step toward a Vercel-friendly setup:

- Vercel can host the web UI and lightweight API layer
- a separate Node worker can keep Playwright, PDF rendering, filesystem-backed exports, and long-running jobs

The local all-in-one workflow still works when `SAT_WORKER_BASE_URL` is not set.

## Vercel Frontend + Worker Deployment

The current recommended hosted setup is:

- Deploy the frontend to Vercel as a static site
- Use the built-in browser mode so the app fetches College Board data directly
- Do not configure any deployment-time environment variables for the workerless path

This repository includes [vercel.json](./vercel.json) for that setup. It:

- skips Vercel install and build steps
- serves the `public/` directory directly
- leaves `/api/*` unconfigured so the browser can fall back to workerless mode

Recommended worker host:

- Default: Render background worker or web/private service with persistent disk
- Runner-up: Fly.io if you want lower-level control over machines, volumes, and process groups

Suggested first production shape:

1. Put the Vercel frontend on its own project from this repository root.
2. Deploy the worker from the same repo with `npm run start:worker`.
3. Mount persistent storage on the worker for local export history and temporary artifacts.
4. Move completed PDF files to object storage when you are ready to make downloads durable across restarts.

## Render Worker Setup

Use a Render `Web Service`, not a Background Worker, because the Vercel frontend needs a public HTTPS endpoint for `/api/*`.

This repository includes:

- [Dockerfile](./Dockerfile) for a Playwright-ready worker image
- [render.yaml](./render.yaml) for a Render Blueprint

Recommended Render flow:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. If you use the Blueprint, Render will pick up [render.yaml](./render.yaml).
4. Make sure the service is public and keep the health check path as `/api/health`.
5. After the first deploy, copy the worker URL, such as `https://sat-qbank-worker.onrender.com`.
6. In Vercel, set `SAT_WORKER_BASE_URL` to that Render URL and redeploy.

Persistent storage notes:

- `SAT_EXPORT_STORAGE_DIR` is set to `/var/data/sat-qbank` in [render.yaml](./render.yaml)
- relative output paths like `./output` will resolve inside that mounted disk on the worker
- export history will also default to that mounted disk unless `SAT_EXPORT_HISTORY_PATH` is set

## Notes

- Use this project within College Board terms and your local copyright boundaries.
- API behavior may change if the upstream question bank changes.
- This repository is designed for local use, not as a hosted service.
