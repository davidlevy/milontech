import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';

async function runTests() {
  console.log('Starting HTTP server...');
  const server = spawn('npx', ['http-server', 'dist', '-p', '3000'], { stdio: 'ignore' });

  // Wait a second for server to start
  await new Promise(r => setTimeout(r, 1000));

  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  page.on('response', response => {
    if (response.status() === 404) {
      console.log('404 URL:', response.url());
    }
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

  // Check if detail blocks are rendered
  const blocks = await page.$$('.detail-block');
  console.log(`Rendered detail blocks: ${blocks.length}`);

  if (blocks.length === 0) {
    console.error('TEST FAILED: Center pane is empty!');
    process.exitCode = 1;
  } else {
    console.log('TEST PASSED: Center pane has items.');
  }

  // Check search functionality
  console.log('Testing search functionality...');
  await page.type('#search-input', 'API');
  await new Promise(r => setTimeout(r, 500));
  
  const searchBlocks = await page.$$('.detail-block');
  console.log(`Rendered detail blocks after search: ${searchBlocks.length}`);

  await browser.close();
  server.kill();
  process.exit();
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
