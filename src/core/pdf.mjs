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
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        right: '10mm',
        bottom: '14mm',
        left: '10mm',
      },
    });
  } finally {
    await page.close();
  }
}
