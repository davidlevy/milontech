import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  await page.goto('http://localhost:3001/test-esm-debug.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500)); // wait for 1.5s
  await browser.close();
  process.exit();
})();
