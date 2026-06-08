import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // 1. Search in sidebar for 'router'
  await page.type('#search-input', 'router');
  await new Promise(r => setTimeout(r, 500));
  
  // 2. Open commander
  await page.evaluate(() => document.getElementById('commander-modal').classList.add('active'));
  await page.evaluate(() => document.getElementById('commander-input').focus());
  
  // 3. Search in commander for 'database'
  await page.type('#commander-input', 'database');
  await new Promise(r => setTimeout(r, 500));
  
  // 4. Hit enter
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 500));
  
  // 5. Verify detail pane title
  const h1 = await page.evaluate(() => {
    const el = document.querySelector('.active-term-en');
    return el ? el.innerText : 'not found';
  });
  console.log("H1 After Commander Search:", h1);
  
  await browser.close();
  process.exit();
})();
