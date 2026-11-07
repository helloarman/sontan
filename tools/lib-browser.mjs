// Headless Chrome helpers. Set CHROME_PATH if Chrome is installed elsewhere.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function openPage() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  return { browser, page };
}
// Rasterises an SVG string to a transparent (or opaque, with bg) image; returns base64.
export function svgToWebp(page, svg, px, q, { type = 'image/webp', bg = null } = {}) {
  return page.evaluate(async (svg, px, q, type, bg) => {
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = px;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, px, px); }
    x.drawImage(img, 0, 0, px, px);
    URL.revokeObjectURL(img.src);
    return c.toDataURL(type, q).split(',')[1];
  }, svg, px, q, type, bg);
}
