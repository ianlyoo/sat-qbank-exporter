import { EXPORT_MODES } from './constants.mjs';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAnswerOptions(answerOptions = []) {
  if (!answerOptions.length) {
    return '';
  }

  return `
    <div class="answer-options">
      <ol class="choices">
        ${answerOptions
          .map(
            (option) => `
              <li>
                <span class="choice-letter">${escapeHtml(option.letter)}.</span>
                <div class="choice-content">${option.content ?? ''}</div>
              </li>
            `
          )
          .join('')}
      </ol>
    </div>
  `;
}

function renderQuestionCard(item, mode) {
  const metaLine = `
    <div class="meta">
      <span>${escapeHtml(item.domain)}</span>
      <span>${escapeHtml(item.skill)}</span>
      <span>${escapeHtml(item.difficultyLabel)}</span>
    </div>
  `;

  const questionHeading =
    mode === EXPORT_MODES.clean
      ? ''
      : `
        <div class="question-header">
          <h2>Question ${escapeHtml(item.questionId)}</h2>
          ${metaLine}
        </div>
      `;

  const answerBlock =
    mode === EXPORT_MODES.teacher
      ? `
        <div class="teacher-block">
          <h3>Correct Answer</h3>
          <div class="teacher-content">${escapeHtml((item.correctAnswer || []).join(', ') || 'N/A')}</div>
          <h3>Rationale</h3>
          <div class="teacher-content">${item.rationale || '<p>No rationale provided.</p>'}</div>
        </div>
      `
      : '';

  return `
    <section class="question-card">
      <div class="question-card-body">
        ${questionHeading}
        ${item.prompt ? `<div class="question-block">${item.prompt}</div>` : ''}
        ${item.stem ? `<div class="question-block">${item.stem}</div>` : ''}
        ${renderAnswerOptions(item.answerOptions)}
        ${answerBlock}
      </div>
    </section>
  `;
}

function renderAnswerAppendixEntry(item) {
  return `
    <section class="answer-entry">
      <div class="answer-entry-header">
        <div>
          <h2>Question ${escapeHtml(item.questionId)}</h2>
          <div class="meta">
            <span>${escapeHtml(item.domain)}</span>
            <span>${escapeHtml(item.skill)}</span>
            <span>${escapeHtml(item.difficultyLabel)}</span>
          </div>
        </div>
        <div class="answer-pill">${escapeHtml((item.correctAnswer || []).join(', ') || 'N/A')}</div>
      </div>
      <div class="answer-entry-body">
        <h3>Rationale</h3>
        <div class="answer-rationale">${item.rationale || '<p>No rationale provided.</p>'}</div>
      </div>
    </section>
  `;
}

function getIncludedDomains(batch) {
  return [...new Set(batch.map((item) => item.domain).filter(Boolean))];
}

function formatModeLabel(mode) {
  switch (mode) {
    case EXPORT_MODES.teacher:
      return 'Default + Key';
    case EXPORT_MODES.clean:
      return 'Clean';
    case EXPORT_MODES.student:
    default:
      return 'Default';
  }
}

function getCoverSubtitle(mode, includeAnswerKey) {
  if (mode === EXPORT_MODES.teacher) {
    return 'Questions with answers and rationale.';
  }

  if (mode === EXPORT_MODES.clean) {
    return 'Minimal print layout.';
  }

  if (includeAnswerKey) {
    return 'Questions only, plus an answer appendix.';
  }

  return 'Questions only.';
}

function renderCoverPage(batch, headerText, mode, includeAnswerKey) {
  const domains = getIncludedDomains(batch);

  return `
    <section class="print-page cover-page">
      <div class="cover-shell">
        <p class="cover-kicker">Practice Packet</p>
        <h1>${escapeHtml(headerText)}</h1>
        <p class="cover-subtitle">${escapeHtml(getCoverSubtitle(mode, includeAnswerKey))}</p>
        <dl class="cover-meta">
          <div>
            <dt>Questions</dt>
            <dd>${escapeHtml(String(batch.length))}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>${escapeHtml(formatModeLabel(mode))}</dd>
          </div>
          <div class="cover-meta-domains">
            <dt>Included Domains</dt>
            <dd>${escapeHtml(domains.join(', ') || 'Not specified')}</dd>
          </div>
        </dl>
      </div>
    </section>
  `;
}

function renderAppendixDividerPage() {
  return `
    <section class="print-page divider-page">
      <div class="divider-shell">
        <p class="cover-kicker">Appendix</p>
        <h1>Answer Key and Rationale</h1>
        <p class="cover-subtitle">
          The following pages contain the correct answer and explanation for each question in this batch.
        </p>
      </div>
    </section>
  `;
}

function renderSummaryPage(batch, headerText) {
  return `
    <section class="print-page summary-page">
      <header class="page-header">
        <h1>${escapeHtml(headerText)}</h1>
        <p>Batch Index</p>
      </header>
      <section class="summary-shell">
        <div class="summary-intro">
          <h2>Included Questions</h2>
          <p>${escapeHtml(`This batch includes ${batch.length} question${batch.length === 1 ? '' : 's'}.`)}</p>
        </div>
        <table class="summary-table">
          <thead>
            <tr>
              <th scope="col">Question</th>
              <th scope="col">Domain</th>
              <th scope="col">Skill</th>
              <th scope="col">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            ${batch
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.questionId)}</td>
                    <td>${escapeHtml(item.domain)}</td>
                    <td>${escapeHtml(item.skill)}</td>
                    <td>${escapeHtml(item.difficultyLabel)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </section>
    </section>
  `;
}

export function renderDocumentHtml({ batch, mode, includeAnswerKey = false, headerText }) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(headerText)}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            font-family: "Georgia", "Times New Roman", serif;
            color: #161616;
            line-height: 1.45;
            font-size: 12px;
            margin: 0;
            background: #ffffff;
          }

          body:not(.layout-ready) #pages-root {
            display: none;
          }

          body.layout-ready #source-cards,
          body.layout-ready #answer-appendix-source,
          body.layout-ready #layout-sandbox {
            display: none;
          }

          #source-cards {
            padding: 12mm 10mm 14mm;
          }

          #layout-sandbox {
            position: fixed;
            inset: 0;
            visibility: hidden;
            pointer-events: none;
            z-index: -1;
          }

          .print-page {
            width: 210mm;
            height: 297mm;
            padding: 10mm 12mm 12mm;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
          }

          .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }

          .cover-page,
          .divider-page {
            justify-content: center;
          }

          .cover-shell,
          .divider-shell {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 18mm 10mm;
            border-top: 0.8px solid #d7d1c7;
            border-bottom: 0.8px solid #d7d1c7;
          }

          .cover-kicker {
            margin: 0 0 4mm;
            color: #7a7166;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.22em;
            text-transform: uppercase;
          }

          .cover-shell h1,
          .divider-shell h1 {
            margin: 0 0 5mm;
            font-size: 28px;
            font-weight: 600;
            letter-spacing: 0.03em;
            line-height: 1.08;
          }

          .cover-subtitle {
            max-width: 120mm;
            margin: 0;
            color: #5f574d;
            font-size: 13px;
            line-height: 1.65;
          }

          .cover-meta {
            display: grid;
            grid-template-columns: minmax(0, 28mm) minmax(0, 34mm) minmax(0, 1fr);
            gap: 6mm;
            margin: 12mm 0 0;
            padding-top: 5mm;
            border-top: 0.6px solid #e4ddd2;
          }

          .cover-meta div {
            display: grid;
            gap: 1.5mm;
          }

          .cover-meta dt {
            color: #7a7166;
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .cover-meta dd {
            margin: 0;
            color: #1f1b16;
            font-size: 12px;
            line-height: 1.5;
          }

          .cover-meta-domains dd {
            max-width: 100%;
          }

          .page-header {
            flex: 0 0 auto;
            border-bottom: 0.6px solid #d7d1c7;
            padding-bottom: 3.5mm;
            margin-bottom: 3.5mm;
          }

          .page-header h1 {
            margin: 0 0 4px;
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.04em;
          }

          .page-header p {
            margin: 0;
            color: #6f665b;
            font-size: 9px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .page-grid {
            flex: 1 1 auto;
            min-height: 0;
            display: flex;
            flex-direction: column;
          }

          .question-slot {
            flex: 1 1 0;
            min-height: 0;
            position: relative;
          }

          .question-slot + .question-slot::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            border-top: 0.6px solid #dfd8cd;
          }

          .question-card {
            height: 100%;
            padding: 8mm 0 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .question-slot:first-child .question-card {
            padding-top: 0;
          }

          .question-card-body {
            flex: 1 1 auto;
            min-height: 0;
          }

          .question-header {
            margin-bottom: 5px;
          }

          .question-header h2 {
            margin: 0 0 3px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.02em;
          }

          .meta {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            color: #7a7166;
            font-size: 9px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }

          .question-block {
            margin-bottom: 6px;
          }

          .question-block p,
          .teacher-content p,
          .choice-content p {
            margin: 0 0 6px;
          }

          .question-block figure,
          .teacher-content figure,
          .choice-content figure {
            margin: 10px 0;
          }

          .question-block svg,
          .teacher-content svg,
          .choice-content svg,
          .question-block img,
          .teacher-content img,
          .choice-content img {
            max-width: 100%;
            height: auto;
          }

          .choices {
            margin: 0;
            padding-left: 18px;
          }

          .choices li {
            margin-bottom: 4px;
            padding-left: 2px;
          }

          .choice-letter {
            font-weight: 700;
          }

          .teacher-block {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 0.6px solid #dfd8cd;
          }

          .teacher-block h3 {
            margin: 0 0 4px;
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          math {
            font-size: 1em;
          }

          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }

          .summary-page {
            padding-top: 12mm;
          }

          .summary-shell {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
          }

          .summary-intro {
            margin-bottom: 6mm;
          }

          .summary-intro h2 {
            margin: 0 0 2mm;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.03em;
          }

          .summary-intro p {
            margin: 0;
            color: #6f665b;
            font-size: 10px;
          }

          .summary-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          .summary-table th,
          .summary-table td {
            border-bottom: 0.6px solid #e4ddd2;
            padding: 2.2mm 1.8mm;
            vertical-align: top;
            text-align: left;
          }

          .summary-table th {
            color: #6f665b;
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .summary-table td {
            font-size: 10px;
            line-height: 1.35;
          }

          .summary-table th:first-child,
          .summary-table td:first-child {
            width: 18%;
          }

          .summary-table th:nth-child(2),
          .summary-table td:nth-child(2) {
            width: 28%;
          }

          .summary-table th:nth-child(3),
          .summary-table td:nth-child(3) {
            width: 38%;
          }

          .summary-table th:last-child,
          .summary-table td:last-child {
            width: 16%;
          }

          #answer-appendix-source {
            padding: 10mm 12mm 12mm;
          }

          .appendix-page {
            padding-top: 12mm;
          }

          .appendix-shell {
            flex: 1 1 auto;
            min-height: 0;
            display: flex;
            flex-direction: column;
          }

          .appendix-intro {
            margin: 0 0 4mm;
            color: #6f665b;
            font-size: 10px;
            line-height: 1.5;
          }

          .appendix-list {
            display: flex;
            flex-direction: column;
            min-height: 0;
          }

          .answer-entry {
            break-inside: avoid;
            page-break-inside: avoid;
            padding: 0 0 4.5mm;
            margin-bottom: 4.5mm;
            border-bottom: 0.6px solid #e4ddd2;
          }

          .answer-entry:last-child {
            margin-bottom: 0;
          }

          .answer-entry-header {
            display: flex;
            align-items: start;
            justify-content: space-between;
            gap: 4mm;
            margin-bottom: 2.5mm;
          }

          .answer-entry-header h2 {
            margin: 0 0 2px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.03em;
          }

          .answer-pill {
            flex: none;
            min-width: 18mm;
            padding: 1.2mm 2.6mm;
            border: 0.6px solid #d7d1c7;
            border-radius: 999px;
            color: #5d5449;
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-align: center;
            text-transform: uppercase;
          }

          .answer-entry-body h3 {
            margin: 0 0 2mm;
            color: #6f665b;
            font-size: 9px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .answer-rationale {
            color: #1f1b16;
          }

          .answer-rationale p {
            margin: 0 0 6px;
          }
        </style>
      </head>
      <body>
        <div id="source-cards">
          ${batch.map((item) => renderQuestionCard(item, mode)).join('')}
        </div>
        ${
          includeAnswerKey
            ? `
        <template id="answer-appendix-template">
          <div id="answer-appendix-source">
            ${batch.map((item) => renderAnswerAppendixEntry(item)).join('')}
          </div>
        </template>
        `
            : ''
        }
        <div id="pages-root"></div>
        <div id="layout-sandbox" aria-hidden="true"></div>
        <template id="cover-page-template">${renderCoverPage(batch, headerText, mode, includeAnswerKey)}</template>
        ${
          includeAnswerKey
            ? `
        <template id="answer-divider-page-template">${renderAppendixDividerPage()}</template>
        `
            : ''
        }
        <template id="summary-page-template">${renderSummaryPage(batch, headerText)}</template>
        <script>
          (() => {
            const headerText = ${JSON.stringify(headerText)};
            const totalQuestions = ${batch.length};
            const includeAnswerKey = ${includeAnswerKey ? 'true' : 'false'};
            const layoutDoneFlag = '__SAT_PDF_LAYOUT_DONE__';
            const layoutErrorFlag = '__SAT_PDF_LAYOUT_ERROR__';
            const tolerance = 2;

            function createPage(cardNodes, slotCount, pageNumber) {
              const page = document.createElement('section');
              page.className = 'print-page';
              page.dataset.slotCount = String(slotCount);

              const header = document.createElement('header');
              header.className = 'page-header';
              header.innerHTML = [
                '<h1>' + headerText.replace(/[&<>"]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[value])) + '</h1>',
                '<p>Questions in this PDF: ' + totalQuestions + ' | Page ' + pageNumber + ' | Layout ' + slotCount + ' per page</p>',
              ].join('');

              const grid = document.createElement('div');
              grid.className = 'page-grid slots-' + slotCount;

              for (const cardNode of cardNodes) {
                const slot = document.createElement('div');
                slot.className = 'question-slot';
                slot.appendChild(cardNode);
                grid.appendChild(slot);
              }

              page.appendChild(header);
              page.appendChild(grid);
              return page;
            }

            function createAppendixPage(entryNodes, pageNumber) {
              const page = document.createElement('section');
              page.className = 'print-page appendix-page';

              const header = document.createElement('header');
              header.className = 'page-header';
              header.innerHTML = [
                '<h1>' + 'Answer Key and Rationale' + '</h1>',
                '<p>' + headerText.replace(/[&<>"]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[value])) + ' | Page ' + pageNumber + '</p>',
              ].join('');

              const shell = document.createElement('section');
              shell.className = 'appendix-shell';

              const intro = document.createElement('p');
              intro.className = 'appendix-intro';
              intro.textContent = 'Answers and explanations for the questions included in this batch.';

              const list = document.createElement('div');
              list.className = 'appendix-list';
              entryNodes.forEach((entryNode) => {
                list.appendChild(entryNode);
              });

              shell.appendChild(intro);
              shell.appendChild(list);
              page.appendChild(header);
              page.appendChild(shell);
              return page;
            }

            function cardsFit(page) {
              return Array.from(page.querySelectorAll('.question-card')).every((card) => {
                return card.scrollHeight - card.clientHeight <= tolerance;
              });
            }

            function pageFits(page) {
              return page.scrollHeight - page.clientHeight <= tolerance;
            }

            async function waitForAssets() {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }

              const images = Array.from(document.images);
              await Promise.all(
                images.map((image) => {
                  if (image.complete) {
                    return Promise.resolve();
                  }

                  return new Promise((resolve) => {
                    image.addEventListener('load', resolve, { once: true });
                    image.addEventListener('error', resolve, { once: true });
                  });
                })
              );
            }

            async function buildLayout() {
              await waitForAssets();

              const pagesRoot = document.getElementById('pages-root');
              const sandbox = document.getElementById('layout-sandbox');
              const answerAppendixTemplate = document.getElementById('answer-appendix-template');
              const answerDividerTemplate = document.getElementById('answer-divider-page-template');
              const coverTemplate = document.getElementById('cover-page-template');
              const summaryTemplate = document.getElementById('summary-page-template');
              const sourceCards = Array.from(document.querySelectorAll('#source-cards .question-card'));
              let index = 0;
              let pageNumber = 1;

              if (coverTemplate) {
                pagesRoot.appendChild(coverTemplate.content.firstElementChild.cloneNode(true));
                pageNumber += 1;
              }

              while (index < sourceCards.length) {
                const remaining = sourceCards.length - index;
                const candidates =
                  remaining === 1
                    ? [1]
                    : remaining === 2
                      ? [2, 1]
                      : [3, 2, 1];

                let selectedCount = candidates[candidates.length - 1];

                for (const candidate of candidates) {
                  const measureCards = sourceCards
                    .slice(index, index + candidate)
                    .map((card) => card.cloneNode(true));
                  const measurePage = createPage(measureCards, candidate, pageNumber);
                  sandbox.replaceChildren(measurePage);

                  if (cardsFit(measurePage)) {
                    selectedCount = candidate;
                    break;
                  }
                }

                const pageCards = sourceCards.slice(index, index + selectedCount);
                pagesRoot.appendChild(createPage(pageCards, selectedCount, pageNumber));
                index += selectedCount;
                pageNumber += 1;
              }

              if (includeAnswerKey && answerAppendixTemplate) {
                if (answerDividerTemplate) {
                  pagesRoot.appendChild(answerDividerTemplate.content.firstElementChild.cloneNode(true));
                  pageNumber += 1;
                }

                const appendixEntries = Array.from(
                  answerAppendixTemplate.content.querySelectorAll('.answer-entry')
                );
                let entryIndex = 0;
                let currentEntries = [];

                while (entryIndex < appendixEntries.length) {
                  const entryNode = appendixEntries[entryIndex].cloneNode(true);
                  const trialEntries = [...currentEntries, entryNode];
                  const measurePage = createAppendixPage(
                    trialEntries.map((entry) => entry.cloneNode(true)),
                    pageNumber
                  );
                  sandbox.replaceChildren(measurePage);

                  if (pageFits(measurePage)) {
                    currentEntries = trialEntries;
                    entryIndex += 1;
                    continue;
                  }

                  if (!currentEntries.length) {
                    pagesRoot.appendChild(createAppendixPage([entryNode], pageNumber));
                    entryIndex += 1;
                    pageNumber += 1;
                    continue;
                  }

                  pagesRoot.appendChild(createAppendixPage(currentEntries, pageNumber));
                  currentEntries = [];
                  pageNumber += 1;
                }

                if (currentEntries.length) {
                  pagesRoot.appendChild(createAppendixPage(currentEntries, pageNumber));
                  pageNumber += 1;
                }
              }

              if (summaryTemplate) {
                pagesRoot.appendChild(summaryTemplate.content.firstElementChild.cloneNode(true));
              }

              sandbox.replaceChildren();
              document.body.classList.add('layout-ready');
              window[layoutDoneFlag] = true;
            }

            window[layoutDoneFlag] = false;
            window[layoutErrorFlag] = null;

            window.addEventListener('load', () => {
              buildLayout().catch((error) => {
                window[layoutErrorFlag] = error instanceof Error ? error.message : String(error);
              });
            });
          })();
        </script>
      </body>
    </html>
  `;
}
