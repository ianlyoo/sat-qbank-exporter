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
      ${questionHeading}
      ${item.prompt ? `<div class="question-block">${item.prompt}</div>` : ''}
      ${item.stem ? `<div class="question-block">${item.stem}</div>` : ''}
      ${renderAnswerOptions(item.answerOptions)}
      ${answerBlock}
    </section>
  `;
}

export function renderDocumentHtml({ batch, mode, headerText }) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(headerText)}</title>
        <style>
          @page {
            size: A4;
            margin: 12mm 10mm 14mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: "Georgia", "Times New Roman", serif;
            color: #161616;
            line-height: 1.45;
            font-size: 12px;
            margin: 0;
            background: #ffffff;
          }

          .document-header {
            border-bottom: 2px solid #d8d8d8;
            margin-bottom: 16px;
            padding-bottom: 10px;
          }

          .document-header h1 {
            margin: 0 0 6px;
            font-size: 20px;
          }

          .document-header p {
            margin: 0;
            color: #555555;
          }

          .question-card {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #dddddd;
            border-radius: 10px;
            padding: 14px 14px 10px;
            margin-bottom: 14px;
          }

          .question-header {
            margin-bottom: 10px;
          }

          .question-header h2 {
            margin: 0 0 4px;
            font-size: 15px;
          }

          .meta {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            color: #666666;
            font-size: 11px;
          }

          .question-block {
            margin-bottom: 10px;
          }

          .question-block p,
          .teacher-content p,
          .choice-content p {
            margin: 0 0 8px;
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
            padding-left: 20px;
          }

          .choices li {
            margin-bottom: 8px;
          }

          .choice-letter {
            font-weight: 700;
          }

          .teacher-block {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed #bbbbbb;
          }

          .teacher-block h3 {
            margin: 0 0 6px;
            font-size: 12px;
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
        </style>
      </head>
      <body>
        <header class="document-header">
          <h1>${escapeHtml(headerText)}</h1>
          <p>${escapeHtml(`Questions in this PDF: ${batch.length}`)}</p>
        </header>
        ${batch.map((item) => renderQuestionCard(item, mode)).join('')}
      </body>
    </html>
  `;
}
