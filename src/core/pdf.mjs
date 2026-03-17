import { chromium } from 'playwright';

export async function withBrowser(headed, fn) {
  const browser = await chromium.launch({ headless: !headed });

  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

export async function renderPdfBatch(browser, html, filePath) {
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__SAT_PDF_LAYOUT_DONE__ === true || window.__SAT_PDF_LAYOUT_ERROR__ !== null);
    const layoutError = await page.evaluate(() => window.__SAT_PDF_LAYOUT_ERROR__);

    if (layoutError) {
      throw new Error(`Failed to build PDF layout: ${layoutError}`);
    }

    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    });
  } finally {
    await page.close();
  }
}
