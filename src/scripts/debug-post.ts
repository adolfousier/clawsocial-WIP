import { chromium } from 'playwright';
import * as fs from 'fs';

const cookies = JSON.parse(fs.readFileSync('./sessions/instagram.json', 'utf-8')).cookies;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  
  const page = await context.newPage();
  await page.goto('https://www.instagram.com/p/DTqwmQhAET8/');
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: './sessions/debug-post.png', fullPage: true });
  console.log('Screenshot saved');
  
  // Try to find like button
  const likeButtons = await page.locator('svg[aria-label="Like"]').count();
  const unlikeButtons = await page.locator('svg[aria-label="Unlike"]').count();
  console.log(`Like buttons: ${likeButtons}, Unlike buttons: ${unlikeButtons}`);
  
  // List all aria-labels on SVGs
  const svgLabels = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg[aria-label]');
    return Array.from(svgs).map(s => s.getAttribute('aria-label'));
  });
  console.log('SVG aria-labels:', svgLabels);

  // Find textareas/inputs
  const textareas = await page.locator('textarea').count();
  const inputs = await page.locator('input[type="text"]').count();
  console.log(`Textareas: ${textareas}, Text inputs: ${inputs}`);
  
  await browser.close();
}

main().catch(console.error);
